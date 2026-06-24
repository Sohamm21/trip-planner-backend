# Voyage — Backend Server

## What this is
The Express.js REST API backend for Voyage, a collaborative travel planning web app.
This server acts as the middleware between the Next.js frontend and Supabase.
All business logic, auth verification, and data access lives here.

## Frontend Repo
The Next.js frontend lives at: `C:\Users\soham\OneDrive\Documents\SandBox\trip-planner`

## Architecture
```
Next.js (frontend)
    ↓  HTTP requests (fetch with Bearer token)
Express Server (this repo)
    ↓  calls Supabase APIs
Supabase (Auth + Postgres database)
```

## Tech Stack
- Runtime: Node.js
- Framework: Express.js (plain JavaScript, no TypeScript)
- Auth & Database: Supabase (@supabase/supabase-js)
- Middleware: cors, dotenv
- Dev: nodemon

## Project Structure
```
voyage-server/
  src/
    index.js              ← Express app entry, registers all routes
    lib/
      supabase.js         ← Supabase client (uses service_role key)
    middleware/
      authenticate.js     ← Verifies JWT from Authorization header
    routes/
      auth.js             ← /api/auth/* endpoints
      trips.js            ← /api/trips/* endpoints
      itinerary.js        ← /api/itinerary/* endpoints
      expenses.js         ← /api/expenses/* endpoints
      places.js           ← /api/places/* endpoints
      collaborators.js    ← /api/collaborators/* endpoints
      stays.js            ← /api/stays/* endpoints
      media.js            ← /api/media/* endpoints
      notes.js            ← /api/notes/* endpoints
  .env                    ← SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORT
  .gitignore
  package.json
```

## Environment Variables (.env)
```
PORT=4000
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Auth Flow
1. `POST /api/auth/register` — creates user via supabase.auth.signUp()
2. `POST /api/auth/login`    — signs in via supabase.auth.signInWithPassword(), returns access_token + refresh_token
3. `POST /api/auth/logout`   — invalidates session via supabase.auth.signOut()
4. Protected routes          — client sends `Authorization: Bearer <access_token>` header
5. authenticate middleware   — calls supabase.auth.getUser(token) to verify, attaches user to req

## API Endpoints (planned)

### Auth
- POST   /api/auth/register
- POST   /api/auth/login
- POST   /api/auth/logout
- GET    /api/auth/me

### Trips
- GET    /api/trips              ← all trips for logged-in user
- POST   /api/trips              ← create a trip
- GET    /api/trips/:id          ← single trip
- PATCH  /api/trips/:id          ← update trip
- DELETE /api/trips/:id          ← delete trip (admin only)

### Itinerary
- GET    /api/trips/:id/itinerary
- POST   /api/trips/:id/itinerary
- PATCH  /api/trips/:id/itinerary/:itemId
- DELETE /api/trips/:id/itinerary/:itemId

### Places
- GET    /api/trips/:id/places
- POST   /api/trips/:id/places
- PATCH  /api/trips/:id/places/:placeId
- DELETE /api/trips/:id/places/:placeId

### Expenses
- GET    /api/trips/:id/expenses
- POST   /api/trips/:id/expenses
- PATCH  /api/trips/:id/expenses/:expenseId
- DELETE /api/trips/:id/expenses/:expenseId

### Collaborators
- GET    /api/trips/:id/collaborators
- POST   /api/trips/:id/collaborators/invite
- PATCH  /api/trips/:id/collaborators/:memberId
- DELETE /api/trips/:id/collaborators/:memberId

### Stays
- GET    /api/trips/:id/stays
- POST   /api/trips/:id/stays
- PATCH  /api/trips/:id/stays/:stayId
- DELETE /api/trips/:id/stays/:stayId

### Media
- GET    /api/trips/:id/media
- POST   /api/trips/:id/media
- DELETE /api/trips/:id/media/:mediaId

### Notes
- GET    /api/trips/:id/notes
- PUT    /api/trips/:id/notes    ← upsert (one note doc per trip)

## Build Order
1. Project setup (Express, env, Supabase client)
2. Auth routes (register, login, logout, me)
3. Auth middleware (protect all routes below)
4. Trips CRUD
5. Itinerary, Places, Stays, Notes
6. Expenses + splits
7. Collaborators + invite flow
8. Media upload (Supabase Storage)

## Security Notes
- Never use service_role key on the frontend — backend only
- Every non-auth route must go through authenticate middleware
- All DB queries filter by user ID derived from the verified JWT
- CORS is restricted to the frontend origin only
