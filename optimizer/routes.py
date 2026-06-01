from flask import Blueprint

optimizer_blueprint = Blueprint('optimizer', __name__)

@optimizer_blueprint.get('/')
def index_route():
    from app import index
    return index()

@optimizer_blueprint.post('/optimize')
def optimize_route():
    from app import optimize
    return optimize()

@optimizer_blueprint.post('/generate-cover-letter')
def generate_cover_letter_route():
    from app import generate_cover_letter
    return generate_cover_letter()

@optimizer_blueprint.post('/extract-resume')
def extract_resume_route():
    from app import extract_resume
    return extract_resume()

@optimizer_blueprint.post('/export-docx')
def export_docx_route():
    from app import export_docx
    return export_docx()

@optimizer_blueprint.post('/export-cover-letter-docx')
def export_cover_letter_docx_route():
    from app import export_cover_letter_docx
    return export_cover_letter_docx()

@optimizer_blueprint.get('/login')
def login_route():
    from app import login
    return login()

@optimizer_blueprint.post('/boost-bullet')
def boost_bullet_route():
    from app import boost_bullet_api
    return boost_bullet_api()

