/** Swagger UI page, configured like sanic-ext's defaults for this API. */

const SWAGGER_VERSION = "5.17.14";

export function swaggerPage(specUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Memegenscript API</title>
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/${SWAGGER_VERSION}/swagger-ui.min.css">
  <style>
    .swagger-ui .info {
        margin-bottom: 10px;
    }
    .swagger-ui .scheme-container {
        margin-top: 0;
        padding: 5px 0 15px;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/${SWAGGER_VERSION}/swagger-ui-bundle.min.js" crossorigin></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: ${JSON.stringify(specUrl)},
        dom_id: "#swagger-ui",
        apisSorter: "alpha",
        operationsSorter: "method",
        docExpansion: "list",
        deepLinking: true,
      });
    };
  </script>
</body>
</html>`;
}
