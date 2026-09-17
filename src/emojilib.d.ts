declare module "emojilib" {
  const emojilib: {
    lib: Record<string, { char: string; keywords?: string[]; category?: string }>;
    ordered: string[];
    fitzpatrick_scale_modifiers: string[];
  };
  export default emojilib;
}
