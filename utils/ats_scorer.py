import re

# Recruiter-approved action verbs for resume checking
ACTION_VERBS = {
    "designed", "spearheaded", "optimized", "implemented", "developed", "built", "led", "managed",
    "created", "architected", "engineered", "streamlined", "accelerated", "boosted", "delivered",
    "coordinated", "executed", "collaborated", "formulated", "enhanced", "resolved", "automated",
    "facilitated", "improved", "increased", "reduced", "saved", "conducted", "authored", "programmed",
    "pioneered", "orchestrated", "refactored", "deployed", "modernized", "established", "analyzed"
}

# Advanced Synonym mappings for precise technology resolution
SYNONYMS = {
    "react.js": ["reactjs", "react js", "react"],
    "reactjs": ["react.js", "react js", "react"],
    "react js": ["react.js", "reactjs", "react"],
    "react": ["react.js", "reactjs", "react js"],
    
    "node.js": ["nodejs", "node js", "node"],
    "nodejs": ["node.js", "node js", "node"],
    "node js": ["node.js", "nodejs", "node"],
    
    "javascript": ["js"],
    "js": ["javascript"],
    
    "typescript": ["ts"],
    "ts": ["typescript"],
    
    "c++": ["cpp", "c plus plus"],
    "cpp": ["c++", "c plus plus"],
    
    "c#": ["csharp", "c sharp", "c-sharp"],
    "csharp": ["c#", "c sharp", "c-sharp"],
    
    "aws": ["amazon web services"],
    "amazon web services": ["aws"],
    
    "gcp": ["google cloud platform"],
    "google cloud platform": ["gcp"],
    
    "ci/cd": ["cicd", "ci-cd", "continuous integration/continuous deployment", "continuous integration"],
    "ci-cd": ["cicd", "ci/cd", "continuous integration/continuous deployment", "continuous integration"],
    "cicd": ["ci/cd", "ci-cd", "continuous integration"],
    
    "machine learning": ["ml"],
    "ml": ["machine learning"],
    
    "artificial intelligence": ["ai"],
    "ai": ["artificial intelligence"],
    
    "postgresql": ["postgres"],
    "postgres": ["postgresql"]
}


def segment_resume_text(resume_text):
    """
    Heuristically segments a raw text resume into logical structural sections
    based on common recruiter and ATS headers.
    """
    if not resume_text:
        return {
            "summary": "",
            "experience": "",
            "projects": "",
            "skills": "",
            "education": "",
            "certifications": ""
        }
        
    sections_def = {
        "summary": ["professional summary", "summary", "about me", "profile", "career objective", "objective"],
        "experience": ["professional experience", "work experience", "employment history", "work history", "experience", "employment", "career history"],
        "projects": ["academic projects", "personal projects", "selected projects", "technical projects", "projects"],
        "skills": ["technical skills", "skills", "technologies", "core competencies", "key skills", "areas of expertise", "expertise"],
        "education": ["academic background", "academic credentials", "education", "qualifications"],
        "certifications": ["licenses & certifications", "licenses and certifications", "certifications", "licenses", "credentials", "courses"]
    }
    
    resume_lower = resume_text.lower()
    found_headers = []
    
    for sec_name, headers in sections_def.items():
        for h in headers:
            # Standalone line pattern or boundary check
            pattern = rf"(?:^|\n)\s*([•\-\*]*\s*{re.escape(h)}s?)\s*(?::|\n|$)"
            for match in re.finditer(pattern, resume_lower):
                idx = match.start()
                found_headers.append((idx, sec_name, match.group(0)))
                break  # Take the first matched header variant
                
    found_headers.sort(key=lambda x: x[0])
    
    sections = {
        "summary": "",
        "experience": "",
        "projects": "",
        "skills": "",
        "education": "",
        "certifications": ""
    }
    
    # Segment text between sorted headers
    for i, (idx, sec_name, header_str) in enumerate(found_headers):
        start = idx + len(header_str)
        end = found_headers[i+1][0] if i + 1 < len(found_headers) else len(resume_text)
        sections[sec_name] = resume_text[start:end].strip()
        
    # Any text before the first section header goes to summary
    if found_headers:
        first_idx = found_headers[0][0]
        intro_text = resume_text[:first_idx].strip()
        if not sections["summary"] and intro_text:
            sections["summary"] = intro_text
            
    # Fallback: if no sections were segmented, assign entire text to experience
    if not any(sections.values()):
        sections["experience"] = resume_text
        
    return sections


def match_keyword_in_text(keyword, text):
    """
    Accurately matches a keyword against text using strict boundaries,
    synonym variations, and singular/plural fallback check.
    """
    kw_clean = keyword.strip().lower()
    if not kw_clean or not text:
        return False
        
    text_lower = text.lower()
    boundary_prefix = r"(?:^|[\s,.;:(){}[\]\-\/\\|])"
    boundary_suffix = r"(?:$|[\s,.;:(){}[\]\-\/\\|])"
    
    candidates = [kw_clean]
    
    # 1. Load synonyms
    if kw_clean in SYNONYMS:
        candidates.extend(SYNONYMS[kw_clean])
        
    # 2. Add standard plural/singular versions
    extra_variations = []
    for cand in candidates:
        if len(cand) >= 3:
            if cand.endswith("s"):
                extra_variations.append(cand[:-1])
            else:
                extra_variations.append(cand + "s")
    candidates.extend(extra_variations)
    candidates = list(set(candidates))
    
    # 3. Match candidates
    for cand in candidates:
        escaped = re.escape(cand)
        pattern = rf"{boundary_prefix}({escaped}){boundary_suffix}"
        if re.search(pattern, text_lower):
            return True
            
    return False


def calculate_advanced_ats_score(resume_text, jd_text, optimized_resume_dict=None, low_credit_mode=False):
    """
    Unified advanced ATS scoring algorithm incorporating:
    - Technical Keyword Proximity & Location weight (60%)
    - Formatting & Recruiter Quality Checks (25%)
    - AI Domain Alignment (15%)
    """
    from app import extract_keywords_from_jd, check_domain_alignment
    
    # Standardize/extract sections
    sections = {
        "summary": "",
        "experience": "",
        "projects": "",
        "skills": "",
        "education": "",
        "certifications": ""
    }
    
    if optimized_resume_dict and isinstance(optimized_resume_dict, dict):
        # Flatten skills
        skills_items = []
        skills_val = optimized_resume_dict.get("skills", {})
        if isinstance(skills_val, dict):
            for cat, items in skills_val.items():
                if isinstance(items, list):
                    skills_items.extend([str(i) for i in items])
                elif isinstance(items, str):
                    skills_items.append(items)
        elif isinstance(skills_val, list):
            skills_items = [str(i) for i in skills_val]
        elif isinstance(skills_val, str):
            skills_items = [skills_val]
        sections["skills"] = " ".join(skills_items)
        
        # Flatten experience
        exp_lines = []
        exp_val = optimized_resume_dict.get("experience", [])
        if isinstance(exp_val, list):
            for exp in exp_val:
                if isinstance(exp, dict):
                    exp_lines.append(str(exp.get("title", "")))
                    exp_lines.append(str(exp.get("company", "")))
                    for b in exp.get("bullets", []):
                        exp_lines.append(str(b))
                elif isinstance(exp, str):
                    exp_lines.append(exp)
        sections["experience"] = "\n".join(exp_lines)
        
        # Flatten projects
        proj_lines = []
        proj_val = optimized_resume_dict.get("projects", [])
        if isinstance(proj_val, list):
            for proj in proj_val:
                if isinstance(proj, dict):
                    proj_lines.append(str(proj.get("name", "")))
                    proj_lines.append(str(proj.get("tech", "")))
                    for b in proj.get("bullets", []):
                        proj_lines.append(str(b))
                elif isinstance(proj, str):
                    proj_lines.append(proj)
        sections["projects"] = "\n".join(proj_lines)
        
        sections["summary"] = str(optimized_resume_dict.get("summary", ""))
        
        # Flatten education
        edu_lines = []
        edu_val = optimized_resume_dict.get("education", [])
        if isinstance(edu_val, list):
            for edu in edu_val:
                if isinstance(edu, dict):
                    edu_lines.append(str(edu.get("degree", "")))
                    edu_lines.append(str(edu.get("school", "")))
                elif isinstance(edu, str):
                    edu_lines.append(edu)
        sections["education"] = "\n".join(edu_lines)
        
        # Flatten certifications
        cert_lines = []
        cert_val = optimized_resume_dict.get("certifications", [])
        if isinstance(cert_val, list):
            for cert in cert_val:
                if isinstance(cert, dict):
                    cert_lines.append(str(cert.get("name", "")))
                elif isinstance(cert, str):
                    cert_lines.append(cert)
        sections["certifications"] = "\n".join(cert_lines)
    else:
        # Heuristically segment raw resume text
        sections = segment_resume_text(resume_text)

    # 1. Technical Keyword Scoring (60 points)
    jd_keywords = extract_keywords_from_jd(jd_text, limit=35)
    matched_kws = []
    missing_kws = []
    
    # Store dynamic categories for the frontend drawer view
    kw_breakdown = {
        "experience": [],
        "projects": [],
        "skills": [],
        "other": []
    }
    
    total_possible_points = len(jd_keywords) * 3.0
    total_matched_points = 0.0
    
    for kw in jd_keywords:
        if not kw:
            continue
        max_weight = 0.0
        best_section = "none"
        
        for sec_name, text in sections.items():
            if match_keyword_in_text(kw, text.lower()):
                # Determine weight based on matching location
                if sec_name == "experience":
                    w = 3.0
                elif sec_name == "projects":
                    w = 2.0
                elif sec_name == "skills":
                    w = 1.0
                else:
                    w = 0.5
                    
                if w > max_weight:
                    max_weight = w
                    best_section = sec_name
                    
        if max_weight > 0.0:
            total_matched_points += max_weight
            matched_kws.append(kw)
            
            # Map location
            if best_section == "experience":
                kw_breakdown["experience"].append(kw)
            elif best_section == "projects":
                kw_breakdown["projects"].append(kw)
            elif best_section == "skills":
                kw_breakdown["skills"].append(kw)
            else:
                kw_breakdown["other"].append(kw)
        else:
            missing_kws.append(kw)
            
    keyword_score = (total_matched_points / total_possible_points * 60.0) if total_possible_points > 0 else 60.0

    # 2. Structural & Formatting Check (25 points)
    struct_score = 0.0
    
    # A. Section presence checklist (10 points total - 2.5 points each)
    sections_checked = {
        "experience": len(sections["experience"].strip()) > 15,
        "projects": len(sections["projects"].strip()) > 15,
        "skills": len(sections["skills"].strip()) > 15,
        "education": len(sections["education"].strip()) > 15
    }
    for sec_name, present in sections_checked.items():
        if present:
            struct_score += 2.5
            
    # B. Action Verb Check in experience + projects (7.5 points)
    exp_proj_corpus = (sections["experience"] + " " + sections["projects"]).lower()
    words = re.findall(r"\b[a-z]{3,}\b", exp_proj_corpus)
    matched_verbs = list(ACTION_VERBS.intersection(words))
    verb_count = len(matched_verbs)
    
    if verb_count >= 4:
        struct_score += 7.5
    elif verb_count == 3:
        struct_score += 5.5
    elif verb_count == 2:
        struct_score += 3.5
    elif verb_count == 1:
        struct_score += 1.5
        
    # C. Quantifiable Metrics Check (7.5 points)
    # Checks for digits, percentages (%), or currency signs ($/€/£)
    metrics_found = re.findall(r"\b\d+(?:\.\d+)?%?\b|[\$\€\£\¥]\d+", exp_proj_corpus)
    unique_metrics = list(set(metrics_found))
    metrics_count = len(unique_metrics)
    
    if metrics_count >= 3:
        struct_score += 7.5
    elif metrics_count == 2:
        struct_score += 5.0
    elif metrics_count == 1:
        struct_score += 2.5

    # 3. AI Domain Alignment / Semantic Fit (15 points)
    ai_score = 15.0
    domain_penalty = 0
    
    # Trigger LLM validator with summary
    summary_text = sections["summary"] or sections["experience"][:400]
    try:
        domain_penalty = check_domain_alignment(summary_text, jd_text, low_credit_mode=low_credit_mode)
        # LLM returns a penalty out of 30, map to our 15 points
        ai_score = max(0.0, 15.0 - (domain_penalty / 2.0))
    except Exception:
        # Fallback local overlap score
        sum_words = set(re.findall(r"\b[a-z]{3,}\b", summary_text.lower()))
        jd_words = set(re.findall(r"\b[a-z]{3,}\b", jd_text.lower()))
        overlap = len(sum_words.intersection(jd_words))
        if len(sum_words) > 0:
            local_penalty = max(0.0, 15.0 - overlap)
            ai_score = max(0.0, 15.0 - local_penalty)
            domain_penalty = int(local_penalty * 2)

    total_score = int(round(keyword_score + struct_score + ai_score))
    total_score = max(0, min(100, total_score))

    return {
        "total": total_score,
        "breakdown": {
            "local_technical_match": int(round(keyword_score)),
            "ai_alignment_score": int(round(ai_score)),
            "structural_score": int(round(struct_score)),
            "final_computed_weight": "60% Tech Keywords / 25% Structure / 15% AI Alignment"
        },
        "score_reasoning": (
            f"Technical keyword match: {int(round(keyword_score))}/60 based on location-weighted matches (Experience matching is weighted 3.0). "
            f"Structural formatting quality: {int(round(struct_score))}/25 (checks sections, metrics, and action verbs). "
            f"AI domain alignment check: {int(round(ai_score))}/15 (penalty: {domain_penalty})."
        ),
        "keyword_analysis": {
            "jd_keywords_extracted": jd_keywords,
            "matched_in_resume": matched_kws,
            "missing_keywords": missing_kws,
            "matched_by_location": kw_breakdown
        },
        "formatting_analysis": {
            "sections_present": sections_checked,
            "action_verbs_found": matched_verbs[:8],
            "action_verbs_count": verb_count,
            "metrics_found": unique_metrics[:8],
            "metrics_count": metrics_count
        }
    }
