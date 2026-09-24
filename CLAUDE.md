# CLAUDE.md - Project Guidelines for smart-closet-mvp

## Project Overview
A mobile-first web app to prevent impulse clothing buys by comparing store photos against a saved wardrobe using AI vision.

## Tech Stack & Language
- Language: JavaScript (Plain modern JS / ES Modules only). No TypeScript.
- Frontend: React + Vite (Plain JavaScript). Port 5173.
- Backend: Node.js + Express (ES Modules). Port 3000.
- Testing: Node.js built-in test runner (`node --test`).

## Core Commands
- Run both servers concurrently: `./run.sh`
- Run backend tests: `npm test`
- Frontend dev server: `npm --prefix frontend run dev`
- Backend dev server: `npm --prefix backend run dev`

## Principles (Lesson 5)
- **Author Ownership:** The human developer decides and reviews all changes. Claude proposes and assists.
- **Scope Discipline:** Strictly implement only what is requested in the current ticket. Prevent scope creep.
- **Verification:** Every change or feature must be tested and verified before marking complete.