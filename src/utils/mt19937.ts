/**
 * MT19937 seeded the way CPython's `random.seed(int)` does, producing the same
 * `random()` doubles. Used so `style: mock` text matches the Python service,
 * which calls `spongemock.mock(text, diversity_bias=0.75, random_seed=0)`.
 */
export class PythonRandom {
  private mt = new Uint32Array(624);
  private index = 624;

  constructor(seed: number) {
    this.initByArray([seed >>> 0]);
  }

  private initGenrand(s: number) {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < 624; i++) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.index = 624;
  }

  private initByArray(key: number[]) {
    this.initGenrand(19650218);
    const mt = this.mt;
    let i = 1;
    let j = 0;
    const n = 624;
    for (let k = Math.max(n, key.length); k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1664525)) + key[j] + j) >>> 0;
      i++;
      j++;
      if (i >= n) {
        mt[0] = mt[n - 1];
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (let k = n - 1; k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= n) {
        mt[0] = mt[n - 1];
        i = 1;
      }
    }
    mt[0] = 0x80000000;
  }

  private generate() {
    const mt = this.mt;
    for (let i = 0; i < 624; i++) {
      const y = (mt[i] & 0x80000000) | (mt[(i + 1) % 624] & 0x7fffffff);
      let v = mt[(i + 397) % 624] ^ (y >>> 1);
      if (y & 1) v ^= 0x9908b0df;
      mt[i] = v >>> 0;
    }
    this.index = 0;
  }

  genrandInt32(): number {
    if (this.index >= 624) this.generate();
    let y = this.mt[this.index++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** Equivalent of Python's `random.random()` */
  random(): number {
    const a = this.genrandInt32() >>> 5;
    const b = this.genrandInt32() >>> 6;
    return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
  }
}

/** Port of the `spongemock` package's `mock()` function. */
export function spongemock(text: string, diversityBias = 0.5, randomSeed: number | null = null): string {
  if (diversityBias < 0 || diversityBias > 1) {
    throw new Error("diversity_bias must be between the inclusive range [0,1]");
  }
  const rng = new PythonRandom(randomSeed ?? Math.floor(Math.random() * 0xffffffff));
  let out = "";
  let lastWasUpper = true;
  let swapChance = 0.5;
  for (const ch of text) {
    let c = ch;
    if (/\p{L}/u.test(c)) {
      if (rng.random() < swapChance) {
        lastWasUpper = !lastWasUpper;
        swapChance = 0.5;
      }
      c = lastWasUpper ? c.toUpperCase() : c.toLowerCase();
      swapChance += (1 - swapChance) * diversityBias;
    }
    out += c;
  }
  return out;
}
