# Claude Workspace

A full-stack AI productivity app built on the Claude API that explores features missing from current AI chat interfaces. Built in the summer after my freshman year at Vanderbilt as a demonstration of product thinking and technical ability.

**[Try it live →](https://claude-workspace-sandy.vercel.app)**

---

## Why I Built This

Current AI chat interfaces are powerful but limited. Conversations are linear, context disappears, and collaboration is impossible. I built Claude Workspace to explore what a more powerful, flexible AI workspace could look like — one designed for researchers, students, and teams who need more than a simple chat window.

The project also reflects my broader interest in applying AI to high-stakes domains, particularly healthcare, where better context retention, collaboration, and annotation tools could meaningfully improve clinical workflows and patient outcomes.

---

## Features

### 📌 Pinned Messages
Save any message to a persistent sidebar with one click. Pinned messages stay visible as you scroll and jump back to the original message when clicked.

### ✂️ Text Selection Pinning
Highlight any portion of a response and pin just that snippet — not the whole message. A floating "Pin Selection" popup appears on highlight, and snippets link back to their source message.

### 🌿 Conversation Branching
Fork any conversation at any point to explore a different direction without losing the original thread. Switch between branches from the sidebar. Each branch is saved independently to the database.

### 👥 Multi-User Shared Conversations
Share a conversation via a generated link. Multiple users can join, send messages, and see each other's responses in real time — powered by Supabase Realtime.

### 🧠 Structured Memory
Explicitly save facts for Claude to remember. Memories are injected into every message as a system prompt, so Claude references them naturally without being told each time.

---

## Tech Stack

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes
- **Database:** Supabase (PostgreSQL + Realtime)
- **AI:** Anthropic Claude API (claude-sonnet-4-5)
- **Deployment:** Vercel

---

## Getting Started

1. Clone the repo
```bash
   git clone https://github.com/amskp1572-a11y/claude-workspace.git
   cd claude-workspace
```

2. Install dependencies
```bash
   npm install
```

3. Create a `.env.local` file in the root with your keys:

4. Run the development server
```bash
   npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

---

## About

Built by Aaliya Salzberg, an undergraduate at Vanderbilt University studying Computer Science, Medicine Health & Society, and Artificial Intelligence. I'm interested in product management at the intersection of AI and healthcare — building tools that improve the lives of patients and providers.

[LinkedIn](http://www.linkedin.com/in/aaliya-salzberg) · [Live Demo](https://claude-workspace-sandy.vercel.app)