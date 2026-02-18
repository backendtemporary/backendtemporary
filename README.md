# RisetexCo Backend API

Backend server for the RisetexCo Fabric Management System (local use only).

## Setup

1. Install dependencies:
```bash
cd backend
npm install
```

2. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The server will start on `http://localhost:3001`

## API Endpoints

- `GET /api/fabrics` - Get all fabrics
- `GET /api/fabrics/:index` - Get a specific fabric by index
- `POST /api/fabrics` - Create a new fabric
- `PUT /api/fabrics` - Update all fabrics (bulk update)
- `PUT /api/fabrics/:index` - Update a specific fabric by index
- `DELETE /api/fabrics/:index` - Delete a fabric by index
- `GET /api/health` - Health check endpoint

## Data Storage

All data is stored in MySQL (`risetexco` database). The server uses connection pooling via `mysql2/promise`.

## Notes

- This backend is designed for local use only
- CORS is enabled for local development
- The server uses Express.js and MySQL
- All API endpoints return JSON responses

