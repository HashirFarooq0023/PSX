import sys
import os

# Append backend directory to sys.path so we can import app
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from app import app
