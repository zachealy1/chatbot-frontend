# AI Customer Support Chatbot for CGI UK

## Purpose

This project aims to develop a secure, AI-powered chatbot tailored to the justice sector for CGI UK. The chatbot will streamline customer support by automating responses to frequently asked questions, adhering to HMCTS and GOV.UK standards, and seamlessly integrating with existing service desk workflows. Its primary goals are to enhance service efficiency, maintain strict data privacy standards, and support multilingual capabilities, including Welsh.

## What's Inside

This project includes:

- A Node.js-based backend powered by Express
- Integration with the ChatGPT API for AI-driven responses
- Secure data handling compliant with HMCTS standards
- Docker setup for streamlined development and deployment
- Static analysis and testing tools for code quality and security
- Accessibility testing to ensure compliance with GOV.UK standards
- Robust error handling and logging for debugging and maintenance
- Admin portal for monitoring and analytics
- Multilingual support, including Welsh, to comply with government standards

## Getting Started

### Prerequisites

Before running the application, ensure you have the following tools installed:

- [Node.js](https://nodejs.org/) v16.0.0 or later
- [yarn](https://yarnpkg.com/)
- [Docker](https://www.docker.com)

### Installation and Running

Install dependencies:

```bash
yarn install
```

Bundle:

```bash
yarn webpack
```

Run:

```bash
yarn start
```

The applications's home page will be available at http://localhost:3100

### Running with Docker

Create docker image:

```bash
docker-compose build
```

Run the application by executing the following command:

```bash
docker-compose up
```

This will start the frontend container exposing the application's port
(set to `3100` in this app).

In order to test if the application is up, you can visit https://localhost:3100 in your browser.

## Developing

### Code style

We use [ESLint](https://github.com/typescript-eslint/typescript-eslint)
alongside [sass-lint](https://github.com/sasstools/sass-lint)

Running the linting with auto fix:

```bash
yarn lint --fix
```

### Running the tests

This app uses [Jest](https://jestjs.io//) as the test engine. You can run unit tests by executing
the following command:

```bash
yarn test
```

Here's how to run functional tests:

```bash
yarn test:routes
```

Running accessibility tests:

```bash
yarn test:a11y
```

### Security

#### CSRF prevention

[Cross-Site Request Forgery](https://github.com/pillarjs/understanding-csrf) prevention has already been
set up in this application, at the application level. However, you need to make sure that CSRF token
is present in every HTML form that requires it. For that purpose you can use the `csrfProtection` macro,
included in this app. Your njk file would look like this:

```
{% from "macros/csrf.njk" import csrfProtection %}
...
<form ...>
  ...
    {{ csrfProtection(csrfToken) }}
  ...
</form>
...
```

#### Helmet

This application uses [Helmet](https://helmetjs.github.io/), which adds various security-related HTTP headers
to the responses. Apart from default Helmet functions, following headers are set:

- [Referrer-Policy](https://helmetjs.github.io/docs/referrer-policy/)
- [Content-Security-Policy](https://helmetjs.github.io/docs/csp/)

There is a configuration section related with those headers, where you can specify:

- `referrerPolicy` - value of the `Referrer-Policy` header

Here's an example setup:

```json
    "security": {
      "referrerPolicy": "origin",
    }
```

Make sure you have those values set correctly for your application.

### Healthcheck

The application exposes a health endpoint (https://localhost:3100/health), created with the use of
[Nodejs Healthcheck](https://github.com/hmcts/nodejs-healthcheck) library. This endpoint is defined
in [health.ts](src/main/routes/health.ts) file. Make sure you adjust it correctly in your application.
In particular, remember to replace the sample check with checks specific to your frontend app,
e.g. the ones verifying the state of each service it depends on.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details
