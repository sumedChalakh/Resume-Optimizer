import json
import pickle
import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBRegressor
from pathlib import Path
import re


class SalaryPredictor:
    def __init__(
        self, model_path="salary_model.pkl", encoder_path="salary_encoders.pkl"
    ):
        self.model_path = model_path
        self.encoder_path = encoder_path
        self.model = None
        self.encoders = {}
        self.scaler_stats = {}
        self.load_or_train()

    def load_or_train(self):
        if Path(self.model_path).exists():
            self.load_model()
        else:
            self.train_model()

    def train_model(self):
        df = self._generate_training_data()
        X, y_min, y_max = self._prepare_features(df, is_training=True)

        self.model_min = XGBRegressor(
            n_estimators=100, max_depth=6, learning_rate=0.1, random_state=42
        )
        self.model_max = XGBRegressor(
            n_estimators=100, max_depth=6, learning_rate=0.1, random_state=42
        )

        self.model_min.fit(X, y_min)
        self.model_max.fit(X, y_max)

        self.save_model()

    def _generate_training_data(self):
        locations = {
            "Bangalore": {"base": 6.5, "multiplier": 1.15},
            "Mumbai": {"base": 6.0, "multiplier": 1.10},
            "Delhi/NCR": {"base": 5.8, "multiplier": 1.08},
            "Pune": {"base": 5.5, "multiplier": 1.05},
            "Hyderabad": {"base": 6.2, "multiplier": 1.12},
            "Chennai": {"base": 5.2, "multiplier": 1.02},
            "Kolkata": {"base": 4.8, "multiplier": 0.95},
            "Remote": {"base": 7.0, "multiplier": 1.20},
        }

        skills_impact = {
            "python": 0.5,
            "java": 0.5,
            "sql": 0.4,
            "spark": 0.8,
            "ml": 1.2,
            "deep learning": 1.3,
            "nlp": 1.4,
            "tensorflow": 0.9,
            "pytorch": 1.0,
            "xgboost": 0.7,
            "aws": 0.6,
            "gcp": 0.6,
            "azure": 0.6,
            "kubernetes": 0.8,
            "docker": 0.5,
            "airflow": 0.7,
            "kafka": 0.7,
            "react": 0.4,
            "nodejs": 0.4,
            "angular": 0.3,
            "go": 0.5,
            "rust": 0.6,
            "scala": 0.7,
            "tableau": 0.4,
            "powerbi": 0.3,
            "looker": 0.5,
            "statistics": 0.5,
            "data science": 1.1,
            "analytics": 0.6,
            "leadership": 0.8,
            "management": 0.9,
        }

        roles = {
            "software engineer": 1.0,
            "data scientist": 1.1,
            "ml engineer": 1.2,
            "backend engineer": 1.0,
            "frontend engineer": 0.95,
            "full stack engineer": 1.05,
            "devops engineer": 1.15,
            "data engineer": 1.1,
            "analytics engineer": 1.0,
        }

        data = []
        np.random.seed(42)

        for _ in range(500):
            loc = np.random.choice(list(locations.keys()))
            role = np.random.choice(list(roles.keys()))
            yoe = np.random.randint(0, 8)

            base = locations[loc]["base"] * roles[role]
            skill_bonus = np.random.uniform(0, 1.5)
            exp_bonus = yoe * 0.25

            sal_min = base + exp_bonus + skill_bonus + np.random.normal(0, 0.3)
            sal_max = sal_min + np.random.uniform(1.0, 2.5)

            data.append(
                {
                    "location": loc,
                    "role": role,
                    "yoe": yoe,
                    "skill_bonus": skill_bonus,
                    "company_size": np.random.choice(["Startup", "Scale-up", "MNC"]),
                    "salary_min": max(3.5, sal_min),
                    "salary_max": sal_max,
                }
            )

        return pd.DataFrame(data)

    def _prepare_features(self, df, is_training=False):
        X = pd.DataFrame()

        if is_training:
            self.encoders["location"] = LabelEncoder()
            self.encoders["role"] = LabelEncoder()
            self.encoders["company_size"] = LabelEncoder()

            X["location"] = self.encoders["location"].fit_transform(df["location"])
            X["role"] = self.encoders["role"].fit_transform(df["role"])
            X["company_size"] = self.encoders["company_size"].fit_transform(
                df["company_size"]
            )
        else:
            def safe_transform(encoder, values, default_val):
                classes = set(encoder.classes_)
                safe_values = [v if v in classes else default_val for v in values]
                return encoder.transform(safe_values)

            X["location"] = safe_transform(self.encoders["location"], df["location"], "Bangalore")
            X["role"] = safe_transform(self.encoders["role"], df["role"], "software engineer")
            X["company_size"] = safe_transform(self.encoders["company_size"], df["company_size"], "Scale-up")

        X["yoe"] = df["yoe"]
        X["skill_bonus"] = df["skill_bonus"]

        if is_training:
            self.scaler_stats = {
                "skill_bonus_mean": df["skill_bonus"].mean(),
                "skill_bonus_std": df["skill_bonus"].std(),
                "yoe_mean": df["yoe"].mean(),
                "yoe_std": df["yoe"].std(),
            }

            return X, df["salary_min"], df["salary_max"]

        return X

    def extract_features_from_jd(self, jd_text, location, yoe, company_size="Scale-up"):
        jd_lower = jd_text.lower()
        skill_bonus = 0.0

        skill_weights = {
            "python": 0.5,
            "java": 0.5,
            "sql": 0.4,
            "spark": 0.8,
            "ml": 1.2,
            "deep learning": 1.3,
            "nlp": 1.4,
            "llm": 1.5,
            "tensorflow": 0.9,
            "pytorch": 1.0,
            "xgboost": 0.7,
            "aws": 0.6,
            "gcp": 0.6,
            "azure": 0.6,
            "kubernetes": 0.8,
            "docker": 0.5,
            "airflow": 0.7,
            "kafka": 0.7,
            "react": 0.4,
            "nodejs": 0.4,
            "tableau": 0.4,
            "powerbi": 0.3,
            "looker": 0.5,
            "data science": 1.1,
            "analytics": 0.6,
        }

        for skill, weight in skill_weights.items():
            if skill in jd_lower:
                skill_bonus += weight

        detected_role = self._infer_role(jd_text)

        df_feat = pd.DataFrame(
            {
                "location": [location],
                "role": [detected_role],
                "yoe": [yoe],
                "skill_bonus": [min(skill_bonus, 2.5)],
                "company_size": [company_size],
            }
        )

        return self._prepare_features(df_feat, is_training=False)

    def _infer_role(self, jd_text):
        jd_lower = jd_text.lower()
        role_keywords = {
            "data scientist": ["model", "statistics", "analysis", "prediction"],
            "ml engineer": ["ml", "machine learning", "model deployment", "pipeline"],
            "data engineer": ["etl", "pipeline", "data warehouse", "spark"],
            "backend engineer": ["api", "server", "database", "backend"],
            "devops engineer": ["deployment", "kubernetes", "ci/cd", "devops"],
        }

        scores = {}
        for role, keywords in role_keywords.items():
            scores[role] = sum(1 for kw in keywords if kw in jd_lower)

        detected = (
            max(scores, key=scores.get)
            if max(scores.values()) > 0
            else "software engineer"
        )
        return detected

    def predict(self, jd_text, location, yoe=0, company_size="Scale-up"):
        X = self.extract_features_from_jd(jd_text, location, yoe, company_size)

        sal_min = float(self.model_min.predict(X)[0])
        sal_max = float(self.model_max.predict(X)[0])

        sal_min = max(3.5, sal_min)
        sal_max = max(sal_min + 1.0, sal_max)

        confidence = min(0.85, 0.65 + (yoe * 0.05))

        return {
            "salary_min_lpa": round(sal_min, 2),
            "salary_max_lpa": round(sal_max, 2),
            "currency": "INR",
            "confidence": round(confidence, 2),
            "detected_role": self._infer_role(jd_text),
        }

    def predict_batch(self, job_list):
        results = []
        for job in job_list:
            pred = self.predict(
                jd_text=job.get("jd_text", ""),
                location=job.get("location", "Bangalore"),
                yoe=job.get("yoe", 0),
                company_size=job.get("company_size", "Scale-up"),
            )
            pred["job_title"] = job.get("job_title", "Unknown")
            results.append(pred)
        return results

    def save_model(self):
        with open(self.model_path, "wb") as f:
            pickle.dump(
                {
                    "model_min": self.model_min,
                    "model_max": self.model_max,
                    "encoders": self.encoders,
                    "scaler_stats": self.scaler_stats,
                },
                f,
            )

    def load_model(self):
        with open(self.model_path, "rb") as f:
            data = pickle.load(f)
            self.model_min = data["model_min"]
            self.model_max = data["model_max"]
            self.encoders = data["encoders"]
            self.scaler_stats = data["scaler_stats"]


if __name__ == "__main__":
    pred = SalaryPredictor()

    jd_sample = """
    We are looking for a Data Scientist with 2+ years of experience.
    Skills required: Python, SQL, Machine Learning, TensorFlow, Statistics.
    Experience with AWS and Docker is a plus.
    """

    result = pred.predict(jd_sample, location="Bangalore", yoe=2, company_size="MNC")
    print(json.dumps(result, indent=2))

    batch = [
        {
            "jd_text": jd_sample,
            "location": "Bangalore",
            "yoe": 2,
            "job_title": "Senior DS",
        },
        {
            "jd_text": "Backend engineer needed. Java, Spring Boot, Kubernetes.",
            "location": "Mumbai",
            "yoe": 3,
            "job_title": "Backend Eng",
        },
    ]
    batch_results = pred.predict_batch(batch)
    print("\nBatch Results:")
    print(json.dumps(batch_results, indent=2))
