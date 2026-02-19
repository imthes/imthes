# Deployment Instructions

This project is deployed to Netlify as a static site.

## Prerequisites
- Netlify CLI (`npm install -g netlify-cli`)
- A Netlify account and site ID.

## Deploy Command
To deploy the `static` folder to production:

```bash
npx netlify-cli deploy --prod --dir static --site fa9237e6-cd1b-4b8a-9858-e832c0bf3265
```

## Cache Busting
When updating the frontend, increment the version query parameter (e.g., `?v=2.5`) in `static/index.html` for:
- `style.css`
- `premium.css`
- `app.js`

This ensures users receive the latest updates immediately.
