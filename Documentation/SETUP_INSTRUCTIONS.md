# Setup Instructions - Flask + SQLite Auction Application

## Quick Start

### 1. Install Dependencies

**Backend (Python):**

**Option A: Direct Installation**
```bash
pip install -r backend/requirements.txt
```

**Option B: Using Virtual Environment (Recommended)**
```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt
```

**Note:** `pytest` and `pytest-cov` are now included in `requirements.txt`, so no need to install separately.

**Frontend (Node.js):**
```bash
npm install
```

### 2. Initialize Database

```bash
# From project root
python -m backend.db
```

This creates `auction.db` in the project root with all required tables.

To seed with demo data:
```bash
python -c "from backend.db import init_db; init_db(sample=True)"
```

### 3. Run the Application

**Terminal 1 - Backend:**
```bash
python -m backend.app
```
Backend will run at: http://localhost:5001 (default port)

**Terminal 2 - Frontend:**
```bash
npm run dev
```
Frontend will run at: http://localhost:5173

### 4. Run Tests

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=backend --cov-report=html
```

## Environment Variables

The frontend uses:
- `VITE_API_BASE_URL` (optional, defaults to `http://localhost:5001/api`)

The backend uses:
- `FLASK_SECRET_KEY` (optional, defaults to `dev-secret-key`)

## Database

- **Location**: `auction.db` (SQLite database in project root)
- **Schema**: Defined in `backend/schema.sql`
- **Initialization**: `python -m backend.db`

## API Documentation

See `README.md` for complete API endpoint documentation.

## Troubleshooting

**"Module not found: flask" or "Module not found: pytest"**
- Ensure you've installed dependencies: `pip install -r backend/requirements.txt`
- If using a virtual environment, make sure it's activated
- Verify you're using Python 3.8 or higher: `python --version`

**Port already in use (5001 or 5173)**
- **Backend (5001):**
  - Windows: `netstat -ano | findstr :5001` then `taskkill /PID <PID> /F`
  - Linux/Mac: `lsof -ti:5001 | xargs kill -9`
- **Frontend (5173):** Vite will automatically use the next available port (5174, 5175, etc.)

**Database locked errors**
- Make sure only one instance of the Flask app is running
- Close any database viewers (DB Browser, etc.) that might have the DB open
- Delete `auction.db` and reinitialize: `python -m backend.db`

**"Permission denied" errors (Linux/Mac)**
- Ensure you have write permissions in the project directory
- Check that `uploads/` and `logs/` directories exist and are writable

**Python version issues**
- Verify Python version: `python --version` (should be 3.8+)
- On some systems, use `python3` instead of `python`
- Ensure `pip` is for the correct Python version: `pip --version`

## Testing Checklist

After setup, verify:
- [ ] Backend starts without errors
- [ ] Frontend starts without errors
- [ ] Can access `http://localhost:5173` in browser
- [ ] Can register a new user
- [ ] Can login with registered user
- [ ] Can browse artworks
- [ ] Can create artwork (as seller)
- [ ] Can place bid (as buyer)
- [ ] Can view balance
- [ ] All tests pass: `pytest tests/ -v`

## First-Time Setup Notes

- The database (`auction.db`) is automatically created when you run `python -m backend.app` if it doesn't exist
- The `uploads/` and `logs/` directories are created automatically by the application
- Sample data can be seeded using: `python -c "from backend.db import init_db; init_db(sample=True)"`
- Default sample users: `alice`, `bob`, `carol` (password: `password123`)

## Additional Resources

- See `CONTRIBUTING.md` for detailed development setup
- See `README.md` for project overview and API documentation
- See `SETUP_EMAIL.md` for email notification configuration

