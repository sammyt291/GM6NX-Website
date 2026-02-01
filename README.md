# GM6NX Website

GM6NX Website is a lightweight Express application that serves a public site with an admin editor for managing pages and navigation.

## Features

- Public site served from the `public/` directory.
- Admin authentication with session-based login.
- Page and navigation management stored in JSON data files.
- Image upload support for editor content.

## Tech Stack

- Node.js + Express
- `express-session` for auth sessions
- `bcryptjs` for password hashing
- `multer` for uploads

## Getting Started

### Prerequisites

- Node.js 18+ (or compatible with the dependencies)
- npm

### Install

```bash
npm install
```

### Run

```bash
npm start
```

By default the server listens on `http://localhost:3000`.

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `3000` |
| `SSL_PORT` | HTTPS port | `3443` |
| `SSL_KEY` | Path to SSL key file for HTTPS | _unset_ |
| `SSL_CERT` | Path to SSL cert file for HTTPS | _unset_ |
| `SESSION_SECRET` | Session secret for cookies | `gm6nx-session-secret` |

If `SSL_KEY` and `SSL_CERT` are set, the HTTPS server will start and auto-reload on certificate changes.

## Default Admin Access

On first run, the server creates a default admin account:

- **Username:** `gm6nx`
- **Password:** `gm6nx!$`

Change this password after logging in by using the admin management tools in the app.

## Data Storage

The application stores data on disk:

- `data/users.json` for admin accounts
- `data/pages.json` for navigation and page content
- `uploads/` for uploaded images

## API Overview

The server exposes JSON endpoints for authentication, page editing, and uploads, including:

- `POST /api/login`
- `POST /api/logout`
- `GET /api/session`
- `GET/PUT /api/nav`
- `GET/POST/PUT /api/pages`
- `POST /api/upload`

## License

This project is provided as-is. Add a license file if you plan to distribute it.
