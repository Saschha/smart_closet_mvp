# smart-closet-mvp

A mobile-first web application designed to prevent impulse clothing buys.

## The MVP
The smallest version that actually solves the problem is a web app where the user can save photos of their clothes (auto-tagged by an AI Vision API) and upload a photo of a new item while shopping to instantly see if they already own something similar.

## Core Tasks (P0 Backlog)
- **Task 1: Wardrobe capture (Local storage)** — Users can upload/take a photo of a clothing item, stored locally with basic metadata.
- **Task 3: "Do I own this?" shopping upload** — Photograph a new item while in a store and submit it for comparison.
- **Task 5: AI visual comparison & reason generation** — Send new photo alongside closet photos to evaluate differences in cut, material, and color.
- **Task 6: Detailed results display** — Show the shopping item side-by-side with matching items and clear textual explanations.

## Architecture
- `/frontend`: React + Vite mobile-first web interface
- `/backend`: Node.js + Express API service