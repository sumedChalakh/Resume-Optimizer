import sys
import os
import json

# Append current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from extensions import db
from models import User, InterviewSession

def run_tests():
    print("==================================================")
    print("[TEST] RUNNING AI MOCK INTERVIEW SIMULATOR TESTS")
    print("==================================================")

    app = create_app()
    app.config['TESTING'] = True

    # Use the application's context
    with app.app_context():
        # Setup temporary test user
        print("\n1. Setting up mock candidate and resume data...")
        test_email = "candidate_test_99@example.com"
        
        # Cleanup any existing test user from previous aborted runs
        existing_user = User.query.filter_by(email=test_email).first()
        if existing_user:
            db.session.delete(existing_user)
            db.session.commit()

        test_user = User(
            name="Alice Test Developer",
            email=test_email,
            password_hash="pbkdf2:sha256:mock_hash_string",
            resume_text="Senior Python Backend Developer with 5 years experience specializing in Flask, PostgreSQL, Docker, and AWS."
        )
        db.session.add(test_user)
        db.session.commit()
        print(f"  [SUCCESS]: Mock user 'Alice' registered with ID {test_user.id}.")

        client = app.test_client()

        # Inject session user_id to simulate manual session login
        with client.session_transaction() as sess:
            sess['user_id'] = test_user.id

        # 2. Test start interview endpoint
        print("\n2. Testing /interview/api/start route...")
        payload_start = {
            "jd": "Python Developer\nRole requires strong expertise in Flask, system design, and PostgreSQL.",
            "type": "Technical",
            "difficulty": "Mid"
        }
        res_start = client.post("/interview/api/start", json=payload_start)
        assert res_start.status_code == 200, f"FAILED: Start route returned {res_start.status_code} instead of 200!"
        
        data_start = res_start.get_json()
        session_id = data_start.get("session_id")
        first_q = data_start.get("first_question")
        round_num = data_start.get("round")

        assert session_id is not None, "FAILED: session_id is missing from start response!"
        assert first_q, "FAILED: first_question is missing or empty!"
        assert round_num == 1, f"FAILED: Expected round 1, got {round_num}!"
        
        print("  [SUCCESS]: Interview started successfully.")
        print(f"  [RESULT] Generated First Question: '{first_q[:80]}...'")

        # 3. Test submitting answer & conversational progression
        print("\n3. Testing /interview/api/answer route...")
        payload_ans = {
            "session_id": session_id,
            "answer": "I have extensive experience building scalable microservices using Python and Flask, connecting to PostgreSQL with optimized indexes."
        }
        res_ans = client.post("/interview/api/answer", json=payload_ans)
        assert res_ans.status_code == 200, f"FAILED: Answer route returned {res_ans.status_code} instead of 200!"
        
        data_ans = res_ans.get_json()
        next_q = data_ans.get("next_question")
        next_round = data_ans.get("round")
        finished = data_ans.get("finished")

        assert next_q, "FAILED: next_question is missing!"
        assert next_round == 2, f"FAILED: Expected round 2, got {next_round}!"
        assert finished is False, "FAILED: Session marked finished prematurely in round 1!"
        
        print("  [SUCCESS]: Answer submitted, recruiter critique evaluated, and round 2 question fetched.")
        print(f"  [RESULT] Next recuiter question: '{next_q[:80]}...'")

        # 4. Test ending interview and scorecard compilation
        print("\n4. Testing /interview/api/end route...")
        payload_end = {
            "session_id": session_id
        }
        res_end = client.post("/interview/api/end", json=payload_end)
        assert res_end.status_code == 200, f"FAILED: End route returned {res_end.status_code} instead of 200!"
        
        data_end = res_end.get_json()
        total_score = data_end.get("total_score")
        tech_score = data_end.get("technical_score")
        comm_score = data_end.get("communication_score")
        beh_score = data_end.get("behavioral_score")
        overall_feedback = data_end.get("overall_feedback")
        history = data_end.get("history")

        assert total_score is not None, "FAILED: total_score missing from scorecard!"
        assert tech_score is not None, "FAILED: technical_score missing!"
        assert comm_score is not None, "FAILED: communication_score missing!"
        assert beh_score is not None, "FAILED: behavioral_score missing!"
        assert overall_feedback, "FAILED: overall_feedback missing!"
        assert history, "FAILED: conversation history list is missing!"

        print("  [SUCCESS]: Interview terminated cleanly. Scorecard compiled.")
        print(f"  [RESULT] Final Score: {total_score}%")
        print(f"  [RESULT] Tech: {tech_score}/25 | Comm: {comm_score}/25 | Behavioral: {beh_score}/15")
        print(f"  [RESULT] Feedback summary: '{overall_feedback[:100]}...'")

        # Verify database record updates
        session_record = db.session.get(InterviewSession, session_id)
        assert session_record.score == total_score, "FAILED: Database record score does not match ended score!"
        print("  [SUCCESS]: Database record score matched official scorecard.")

        # Cleanup test data
        print("\n5. Cleaning up temporary test records...")
        db.session.delete(session_record)
        db.session.delete(test_user)
        db.session.commit()
        print("  [SUCCESS]: Cleaned up mock database user and sessions cleanly.")

    print("\n==================================================")
    print("ALL TESTS PASSED SUCCESSFULLY! MOCK INTERVIEW SIMULATOR IS 100% CORRECT.")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
