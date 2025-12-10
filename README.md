# bolt-generated-project

# Project Overview
This project is a web-based application designed to provide a modern and user-friendly interface. It focuses on delivering a seamless experience for users without any mobile app components.

## Setup Instructions
1. Clone the repository:
   ```bash
   git clone <repository-url>
   ```
2. Navigate to the project directory:
   ```bash
   cd bolt-generated-project-main
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm start
   ```

## Usage
Access the web interface by opening your browser and navigating to `http://localhost:3000`.

## Deployment to Cloudflare Pages

### Manual Configuration
1. Access the [Cloudflare Pages Dashboard](https://dash.cloudflare.com) and create a new project
2. Connect your Git repository
3. Configure the following build options:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node.js version: `18.x` (or higher)

### Troubleshooting SPA Routing
The project already includes configurations to ensure that SPA routing works correctly on Cloudflare Pages:

1. `_redirects` file in the `public` folder for route redirection
2. `_routes.json` file for route configuration on Cloudflare
3. Configurations in `index.html` to avoid issues with Cloudflare's lockdown-install.js
4. Chunking configuration in `vite.config.js` for better performance

If you encounter issues with "Removing unpermitted intrinsics lockdown-install.js", check:
- The `public/lockdown-no-op.js` file is included in the build
- Security initialization script configurations were added to `index.html`

## Contributing
Contributions are welcome! Please follow these steps:
1. Fork the repository.
2. Create a new branch for your feature or bugfix.
3. Submit a pull request with a detailed description of your changes.
