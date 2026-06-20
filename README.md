# Eclyps Vision

Transform any image into structured, reusable information.

Eclyps Vision is an open-source image intelligence tool powered by Gemini. Upload one image, use your own Gemini API key, and receive a detailed description, OCR text, semantic tags, accessibility alt text, JSON, Markdown, and CSV from a single request.

## Features

- Drag, paste, or browse for one image
- PNG, JPG, and WEBP support
- Gemini-powered description, OCR, tags, alt text, and summary
- JSON, Markdown, and CSV output
- Copy and download controls
- Local-only API key storage
- No accounts, databases, analytics, ads, or tracking

## Run Locally

Use any static server from the project root.

```bash
python -m http.server 3000
```

Then open:

```text
http://localhost:3000
```

## Privacy

Your Gemini API key is stored in your browser's local storage. Images and keys are not stored by Eclyps Vision. Analysis requests are sent directly from your browser to the Gemini API.

## Built With

- HTML
- CSS
- Vanilla JavaScript
- Gemini API

## License

MIT License (c) 2026 Eclyps
