import json
from flask import Blueprint, request, jsonify, make_response, session
from extensions import db
from models import User, InterviewSession
from app import generate_model_response, parse_ai_json

interview_blueprint = Blueprint("interview", __name__)


def _corsify(response):
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "*")
    response.headers.add("Access-Control-Allow-Methods", "*")
    return response


@interview_blueprint.route("/interview/api/start", methods=["POST", "OPTIONS"])
def start_interview():
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    user_id = session.get('user_id')
    if not user_id:
        response = jsonify({"error": "Unauthorized. Please log in first."})
        return _corsify(response), 401

    payload = request.get_json(silent=True) or {}
    jd_text = str(payload.get("jd", "")).strip()
    interview_type = str(payload.get("type", "Mixed")).strip()
    difficulty = str(payload.get("difficulty", "Mid")).strip()

    if not jd_text:
        response = jsonify({"error": "Job description context is required to align interview questions."})
        return _corsify(response), 400

    # Retrieve user's resume
    user = db.session.get(User, user_id)
    if not user or not user.resume_text:
        response = jsonify({"error": "Please upload a resume in the dashboard before starting an interview session."})
        return _corsify(response), 400

    resume_text = user.resume_text
    job_title = jd_text.split("\n")[0][:100] or "Target Role"

    # Define first question generator prompt
    system_prompt = (
        "You are an elite corporate technical recruiter and hiring manager.\n"
        f"Generate exactly ONE highly specific, realistic, and challenging interview question (Difficulty: {difficulty}, Type: {interview_type}) "
        "designed for the candidate's target job description based on their resume.\n"
        "Ensure the question is professional, clear, and does not contain generic welcoming/introduction remarks. Poses the question directly."
    )
    user_message = f"Job Description:\n{jd_text[:1000]}\n\nCandidate Resume:\n{resume_text[:2000]}"

    try:
        raw_response, _ = generate_model_response(user_message, system_prompt=system_prompt)
        first_question = raw_response.strip()
    except Exception:
        first_question = "Could you walk me through your technical experience working with the core requirements of this role?"

    # Create new session record in database
    interview_sess = InterviewSession(
        user_id=user.id,
        job_title=job_title,
        interview_type=interview_type,
        difficulty=difficulty,
        history=json.dumps([{
            "question": first_question,
            "answer": None,
            "score": None,
            "critique": None
        }]),
        score=0
    )
    db.session.add(interview_sess)
    db.session.commit()

    response = jsonify({
        "session_id": interview_sess.id,
        "first_question": first_question,
        "round": 1,
        "max_rounds": 5
    })
    return _corsify(response)


@interview_blueprint.route("/interview/api/answer", methods=["POST", "OPTIONS"])
def submit_answer():
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    user_id = session.get('user_id')
    if not user_id:
        response = jsonify({"error": "Unauthorized. Please log in first."})
        return _corsify(response), 401

    payload = request.get_json(silent=True) or {}
    session_id = payload.get("session_id")
    answer_text = str(payload.get("answer", "")).strip()

    if not session_id or not answer_text:
        response = jsonify({"error": "Session ID and candidate answer are required."})
        return _corsify(response), 400

    interview_sess = db.session.get(InterviewSession, session_id)
    if not interview_sess or interview_sess.user_id != user_id:
        response = jsonify({"error": "Interview session not found."})
        return _corsify(response), 404

    history = []
    try:
        history = json.loads(interview_sess.history) if interview_sess.history else []
    except Exception:
        history = []

    if not history:
        response = jsonify({"error": "Invalid session state."})
        return _corsify(response), 400

    current_round_idx = len(history) - 1
    # Save user answer to the current active question block
    history[current_round_idx]["answer"] = answer_text

    # Evaluate the submitted answer using LLM
    eval_prompt = (
        "You are an expert technical interviewer. Evaluate the candidate's answer based on the posed question.\n"
        "Provide a score from 1 to 10 (as an integer) representing the technical accuracy, fit, and communication clarity.\n"
        "Provide a brief, supportive, but professional constructive critique (max 3 sentences) detailing gaps or strengths.\n"
        "Respond ONLY in this JSON format:\n"
        "{\n"
        "  \"score\": integer_between_1_and_10,\n"
        "  \"critique\": \"string\"\n"
        "}"
    )
    eval_message = f"Question asked: {history[current_round_idx]['question']}\nCandidate Answer: {answer_text}"

    score_val = 5
    critique_val = "Thank you for sharing that answer."
    try:
        raw_eval, _ = generate_model_response(eval_message, system_prompt=eval_prompt)
        res = parse_ai_json(raw_eval)
        if isinstance(res, dict) and "score" in res:
            score_val = int(res["score"])
            critique_val = str(res["critique"])
    except Exception:
        pass

    history[current_round_idx]["score"] = score_val
    history[current_round_idx]["critique"] = critique_val

    # If completed all 5 rounds, mark as finished
    if len(history) >= 5:
        interview_sess.history = json.dumps(history)
        db.session.commit()
        response = jsonify({
            "session_id": interview_sess.id,
            "finished": True,
            "round": 5,
            "max_rounds": 5
        })
        return _corsify(response)

    # Otherwise, generate the next logical question
    next_round_num = len(history) + 1
    user = db.session.get(User, user_id)
    resume_text = user.resume_text if user else ""

    next_question_prompt = (
        "You are an elite corporate interviewer. Generate exactly ONE logical subsequent interview question.\n"
        f"This is Question {next_round_num} of 5. Focus on a new, distinct topic appropriate for the role and candidate's level.\n"
        "Do not repeat questions or topics already asked. Poses the question directly without introductory filler."
    )
    
    # Pack active history into contextual message
    history_ctx = "\n".join([f"Q: {h['question']}\nA: {h['answer']}" for h in history if h.get("answer")])
    next_message = f"Interview History so far:\n{history_ctx}\n\nCandidate Resume context:\n{resume_text[:1000]}"

    try:
        raw_q, _ = generate_model_response(next_message, system_prompt=next_question_prompt)
        next_question = raw_q.strip()
    except Exception:
        next_question = "Could you provide an example of how you troubleshoot issues in a collaborative team setup?"

    # Append next question block with empty answer/scores
    history.append({
        "question": next_question,
        "answer": None,
        "score": None,
        "critique": None
    })

    interview_sess.history = json.dumps(history)
    db.session.commit()

    response = jsonify({
        "session_id": interview_sess.id,
        "next_question": next_question,
        "round": next_round_num,
        "max_rounds": 5,
        "finished": False
    })
    return _corsify(response)


@interview_blueprint.route("/interview/api/end", methods=["POST", "OPTIONS"])
def end_interview():
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    user_id = session.get('user_id')
    if not user_id:
        response = jsonify({"error": "Unauthorized. Please log in first."})
        return _corsify(response), 401

    payload = request.get_json(silent=True) or {}
    session_id = payload.get("session_id")

    if not session_id:
        response = jsonify({"error": "Session ID is required."})
        return _corsify(response), 400

    interview_sess = db.session.get(InterviewSession, session_id)
    if not interview_sess or interview_sess.user_id != user_id:
        response = jsonify({"error": "Interview session not found."})
        return _corsify(response), 404

    history = []
    try:
        history = json.loads(interview_sess.history) if interview_sess.history else []
    except Exception:
        history = []

    if not history:
        response = jsonify({"error": "Empty conversation state."})
        return _corsify(response), 400

    # Ensure all rounds are marked scored (default 5 for incomplete)
    for block in history:
        if block.get("score") is None:
            block["score"] = 5
        if block.get("critique") is None:
            block["critique"] = "Response completed."

    # Call LLM scorecard analysis generator
    scorecard_prompt = (
        "You are an expert recruiter panel. Generate a detailed, highly accurate mock interview performance scorecard "
        "and ideal responses based on the provided interview chat log.\n"
        "Review each answer carefully. Generate an overall score (0 to 100), sub-scores out of 25 for 'Technical Accuracy', "
        "25 for 'Communication Clarity', and 15 for 'Behavioral Fit' (Total max: 65, which we will map out).\n"
        "For each question, output an actionable 'ideal_answer' (2 sentences) explaining how an elite candidate would respond.\n"
        "Respond ONLY in this JSON format:\n"
        "{\n"
        "  \"total_score\": integer_between_0_and_100,\n"
        "  \"technical_score\": integer_between_0_and_25,\n"
        "  \"communication_score\": integer_between_0_and_25,\n"
        "  \"behavioral_score\": integer_between_0_and_15,\n"
        "  \"overall_feedback\": \"Detailed summary of their strong points and key areas to study (max 4 sentences).\",\n"
        "  \"questions_analysis\": [\n"
        "    {\n"
        "      \"question\": \"string\",\n"
        "      \"answer\": \"string\",\n"
        "      \"critique\": \"string\",\n"
        "      \"ideal_answer\": \"string\"\n"
        "    }\n"
        "  ]\n"
        "}"
    )

    history_log = json.dumps(history)
    
    total_val = 65
    tech_val = 18
    comm_val = 18
    beh_val = 12
    feedback_val = "Well done completing the mock interview! Focus on detailing specific technical architectures in backend queries."
    
    try:
        raw_scorecard, _ = generate_model_response(history_log, system_prompt=scorecard_prompt)
        res = parse_ai_json(raw_scorecard)
        if isinstance(res, dict) and "total_score" in res:
            total_val = int(res["total_score"])
            tech_val = int(res.get("technical_score", 18))
            comm_val = int(res.get("communication_score", 18))
            beh_val = int(res.get("behavioral_score", 12))
            feedback_val = str(res["overall_feedback"])
            
            # Map ideal answers back into our history array
            q_map = {q_block["question"].strip().lower(): q_block.get("ideal_answer", "") for q_block in res.get("questions_analysis", [])}
            for block in history:
                q_key = block["question"].strip().lower()
                block["ideal_answer"] = q_map.get(q_key, "Provide specific metrics, active action verbs, and structural diagrams in your responses.")
    except Exception:
        # Fallback ideal answers
        for block in history:
            block["ideal_answer"] = "Outline core technologies explicitly, describe your precise action, and highlight the measurable result (e.g. latency reduced, hours saved)."

    interview_sess.score = total_val
    interview_sess.feedback = feedback_val
    interview_sess.history = json.dumps(history)
    db.session.commit()

    response = jsonify({
        "session_id": interview_sess.id,
        "total_score": total_val,
        "technical_score": tech_val,
        "communication_score": comm_val,
        "behavioral_score": beh_val,
        "overall_feedback": feedback_val,
        "history": history
    })
    return _corsify(response)
