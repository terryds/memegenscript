import { describe, expect, it } from "vitest";
import { Text } from "../src/models/text";
import { decode, encode } from "../src/utils/text";
import { clean } from "../src/utils/urls";
import { validateColor } from "../src/utils/colors";
import { twemojiCode } from "../src/utils/emoji";

const LINES_SLUG: Array<[string[], string]> = [
  [["hello world"], "hello_world"],
  [["?%#/&\\<>"], "~q~p~h~s~a~b~l~g"],
  [["a/b", "c"], "a~sb/c"],
  [["variable_name"], "variable__name"],
  [["variable-name"], "variable--name"],
  [["foo\nbar"], "foo~nbar"],
  [["def data() -> Dict"], "def_data()_--~g_Dict"],
  [["finish <- start"], "finish_~l--_start"],
  [['That\'s not how "this" works'], "That's_not_how_''this''_works"],
  [["git commit --no-verify"], "git_commit_----no--verify"],
  [["_username likes _charname"], "__username_likes___charname"],
  [["underscore_ dash-"], "underscore__-dash--"],
  [["kill -9"], "kill_--9"],
];

describe("utils.text", () => {
  it.each(LINES_SLUG)("encodes %j as %s", (lines, slug) => {
    expect(encode(lines)).toBe(slug);
  });

  it.each(LINES_SLUG)("decodes %j from %s", (lines, slug) => {
    expect(decode(slug)).toEqual(lines);
  });

  it("decodes dashes", () => {
    expect(decode("hello-world")).toEqual(["hello world"]);
  });

  it("encodes smart quotes", () => {
    expect(encode(["it’ll be great “they” said"])).toBe('it\'ll_be_great_"they"_said');
  });

  it("encodes en dashes", () => {
    expect(encode(["1–2 in. of snow"])).toBe("1-2_in._of_snow");
  });
});

describe("utils.urls.clean", () => {
  it.each([
    ["http://localhost:5000/images/iw/_.png", "http://localhost:5000/images/iw.png"],
    ["http://localhost:5000/images/iw/a/_/_.png", "http://localhost:5000/images/iw/a.png"],
    ["http://localhost:5000/images/iw/a/_.png?width=100", "http://localhost:5000/images/iw/a.png?width=100"],
    ["http://localhost:5000/images/vince/a/_.b/c_d.png", "http://localhost:5000/images/vince/a/_.b/c_d.png"],
    ["http://localhost:5000/images/vince/a/_.b/c-d.png", "http://localhost:5000/images/vince/a/_.b/c-d.png"],
  ])("cleans %s", (url, cleaned) => {
    expect(clean(url)).toBe(cleaned);
  });
});

describe("utils.colors", () => {
  it("accepts names and hex codes with or without #", () => {
    expect(validateColor("red")[1]).toBe(true);
    expect(validateColor("FF80ED")).toEqual(["#FF80ED", true]);
    expect(validateColor("#abc")[1]).toBe(true);
    expect(validateColor("blue2")[1]).toBe(false);
  });
});

describe("utils.emoji", () => {
  it("builds twemoji codes", () => {
    expect(twemojiCode("👍")).toBe("1f44d");
    expect(twemojiCode("❤️")).toBe("2764");
    expect(twemojiCode("👨‍👩‍👧")).toBe("1f468-200d-1f469-200d-1f467");
  });
});

describe("Text.stylize", () => {
  it.each([
    ["none", "Hello, world!", "Hello, world!"],
    ["default", "these are words.", "These are words."],
    ["default", "These ARE words.", "These ARE words."],
    ["upper", "Hello, world!", "HELLO, WORLD!"],
    ["lower", "Hello, world!", "hello, world!"],
    ["title", "these are words", "These Are Words"],
    ["capitalize", "these are words", "These are words"],
    ["mock", "these are words", "ThEsE aRe WorDs"],
    ["<unknown>", "Hello, world!", "Hello, world!"],
  ])("applies the %s style", (style, before, after) => {
    const text = new Text();
    text.style = style;
    expect(text.stylize(before)).toBe(after);
  });

  it("defaults to upper", () => {
    const text = new Text();
    text.style = "";
    expect(text.stylize("Foobar")).toBe("FOOBAR");
  });

  it("respects case when set in any line", () => {
    const text = new Text({ style: "default" });
    expect(text.stylize("foo", { lines: ["foo", " ", "bar"] })).toBe("Foo");
    expect(text.stylize("foo", { lines: ["foo", " ", "Bar"] })).toBe("foo");
  });

  it("expands emoji aliases", () => {
    expect(new Text({ style: "none" }).stylize(":thumbsup: :+1:")).toBe("👍 👍");
  });
});
