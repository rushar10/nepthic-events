declare module "svg-to-pdfkit" {
  type Options = { width?: number; height?: number; assumePt?: boolean; preserveAspectRatio?: string; fontCallback?: (family: string, bold: boolean, italic: boolean) => string };
  export default function SVGtoPDF(doc: PDFKit.PDFDocument, svg: string, x: number, y: number, options?: Options): void;
}
