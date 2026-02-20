import os
import sys

# Add the root directory to the path so we can import app
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app import app
from serverless_wsgi import handle_request

def handler(event, context):
    return handle_request(app, event, context)
