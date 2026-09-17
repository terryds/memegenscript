/** Port of `app/utils/html.py`: the example/test gallery pages. */
import { PREVIEW_SIZE } from "../settings";

const COLUMNS_STYLE = `
<style>
#images {
   /* Prevent vertical gaps */
   line-height: 0;

   -webkit-column-count: 6;
   -webkit-column-gap:   0px;
   -moz-column-count:    6;
   -moz-column-gap:      0px;
   column-count:         6;
   column-gap:           0px;
}

#images img {
  /* Just in case there are inline attributes */
  width: 100% !important;
  height: auto !important;
}

@media (max-width: 1140px) {
  #images {
  -moz-column-count:    5;
  -webkit-column-count: 5;
  column-count:         5;
  }
}
@media (max-width: 960px) {
  #images {
  -moz-column-count:    4;
  -webkit-column-count: 4;
  column-count:         4;
  }
}
@media (max-width: 720px) {
  #images {
  -moz-column-count:    3;
  -webkit-column-count: 3;
  column-count:         3;
  }
}
@media (max-width: 540px) {
  #images {
  -moz-column-count:    2;
  -webkit-column-count: 2;
  column-count:         2;
  }
}

body {
  margin: 0;
  padding: 0;
}
</style>
`.trim();

const REFRESH_SCRIPT = `
<script>
    setInterval(function() {
        var images = document.images;
        for (var i=0; i<images.length; i++) {
            images[i].src = images[i].src.replace(
                /\\btime=[^&]*/, 'time=' + new Date().getTime()
            );
        }
    }, {interval});
</script>
`;

const RESIZE_SCRIPT = `
<script
    src="https://cdnjs.cloudflare.com/ajax/libs/iframe-resizer/4.2.11/iframeResizer.contentWindow.js"
    integrity="sha512-RMBWitJB1ymY4l6xeYsFwoEgVCAnOWX/zL1gNwXjlUj78nZ8SVbJsZxbH/w0p2jDNraHkOW8rzQgcJ0LNSXWBA=="
    crossorigin="anonymous">
</script>
`;

function page(head: string, body: string): string {
  return `
<!doctype html>
<html>
<head>
${head}
</head>
<body>
${body}
</body>
</html>
`;
}

export function gallery(
  urls: string[],
  { columns, refresh, queryString = "" }: { columns: boolean; refresh: number; queryString?: string },
): string {
  const extra = queryString ? "&" + queryString : "";
  if (columns) {
    if (refresh) return columnsDebug(urls, refresh, extra);
    return columnsGallery(urls);
  }
  return gridDebug(urls, refresh, extra);
}

function columnsGallery(urls: string[]): string {
  const elements = urls.map(
    (url) => `
<a href="https://memecomplete.com/edit/${url}" target="_parent">
    <img src="${url}?width=${PREVIEW_SIZE[0]}&frames=10">
</a>
`,
  );
  elements.push(RESIZE_SCRIPT);
  const head = "<title>Memegenscript | examples</title>\n" + COLUMNS_STYLE;
  const body = `<section id="images">\n${elements.join("\n")}\n</section>`;
  return page(head, body);
}

function columnsDebug(urls: string[], refresh: number, extra: string): string {
  const elements = urls.map(
    (url) => `
<a href="${url}">
    <img src="${url}?width=${PREVIEW_SIZE[0]}&time=0${extra}">
</a>
`,
  );
  if (refresh) elements.push(REFRESH_SCRIPT.replace("{interval}", String(refresh * 1000)));
  const head = "<title>Memegenscript | debug</title>\n" + COLUMNS_STYLE;
  const body = `<section id="images">\n${elements.join("\n")}\n</section>`;
  return page(head, body);
}

function gridDebug(urls: string[], refresh: number, extra: string): string {
  const elements = urls.map(
    (url) => `
<a href="${url}">
    <img src="${url}?time=0${extra}">
</a>
`,
  );
  elements.push(REFRESH_SCRIPT.replace("{interval}", String(refresh * 1000)));
  const head = "<title>Memegenscript | test</title>\n";
  return page(head, elements.join("\n"));
}
