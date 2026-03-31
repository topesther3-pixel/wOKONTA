 wOKONTA

## Idea
wOKONTA is a voice-powered financial management application that helps business women track their income, expenses, and debts using natural voice commands. The app integrates AI assistance to provide personalized financial advice.

## Problem
Business women often rely heavily on memory to track income, personal expenses, and all financial activities. At the end of the day, they lack clear visibility into their financial performance—whether they're profitable or not. Without proper categorization and records, it's impossible to secure loans or make informed business decisions.

## Features
- Voice input for recording transactions (income and expenses)
- Debt management (adding, tracking payments)
- AI chatbot (Akosua) for personalized financial advice
- Phone number and PIN authentication
- Admin dashboard for user and data management
- Demo mode for testing the app
- Multilingual support
- Real-time data synchronization

## Tech Stack
- *Frontend*: React, TypeScript, Vite, Tailwind CSS
- *Backend*: Node.js with Express
- *Database*: Supabase (PostgreSQL)
- *Authentication and Storage*: Firebase
- *AI*: Google Gemini
- *Others*: Lucide React (icons), Motion (animations)

## Architecture
The application follows a client-server architecture:
- *Client-side*: Single-page React application with responsive UI
- *Server-side*: Express server to handle API requests
- *Database*: Supabase for data storage with real-time synchronization
- *Authentication*: Firebase for phone authentication and user profile storage
- *AI*: Integration of Google Gemini for voice command analysis and financial advice

## Local Execution

*Prerequisites:* Node.js

1. Install dependencies:
   npm install
2. Set the GEMINI_API_KEY in [.env.local](.env.local) with your Gemini API key
3. Run the application:
   npm run dev
