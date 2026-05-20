import type { SizeValue } from "@/app/api/size-attributes/route";

const SUFFIX_REGEX = /^(\d+\.?\d*)\s+(.+)$/;
const LETTER_REGEX = /^[a-zA-Z]|^\d+[a-zA-Z]/;

export type SizeCategory = "letter" | "numeric" | "numeric-with-suffix";

export interface ClassifiedValue {
  value: SizeValue;
  category: SizeCategory;
  suffix: string | null;
  numericPart: string | null;
}

export function classifyValue(value: SizeValue): ClassifiedValue {
  const name = value.name.trim();

  const suffixMatch = name.match(SUFFIX_REGEX);
  if (suffixMatch) {
    return {
      value,
      category: "numeric-with-suffix",
      suffix: suffixMatch[2],
      numericPart: suffixMatch[1],
    };
  }

  if (LETTER_REGEX.test(name)) {
    return {
      value,
      category: "letter",
      suffix: null,
      numericPart: null,
    };
  }

  return {
    value,
    category: "numeric",
    suffix: null,
    numericPart: name,
  };
}

export interface SizeHierarchy {
  hasLetters: boolean;
  hasNumerics: boolean;
  hasSuffixes: boolean;
  letters: ClassifiedValue[];
  numerics: ClassifiedValue[];
  suffixGroups: Record<string, ClassifiedValue[]>;
  suffixes: string[];
}

export function buildHierarchy(values: SizeValue[]): SizeHierarchy {
  const classified = values.map(classifyValue);

  const letters = classified.filter((v) => v.category === "letter");
  const numerics = classified.filter((v) => v.category === "numeric");
  const withSuffix = classified.filter((v) => v.category === "numeric-with-suffix");

  const suffixGroups: Record<string, ClassifiedValue[]> = {};
  for (const cv of withSuffix) {
    const suffix = cv.suffix!;
    if (!suffixGroups[suffix]) suffixGroups[suffix] = [];
    suffixGroups[suffix].push(cv);
  }

  for (const suffix of Object.keys(suffixGroups)) {
    suffixGroups[suffix].sort(
      (a, b) => parseFloat(a.numericPart!) - parseFloat(b.numericPart!),
    );
  }
  numerics.sort(
    (a, b) => parseFloat(a.numericPart!) - parseFloat(b.numericPart!),
  );

  return {
    hasLetters: letters.length > 0,
    hasNumerics: numerics.length > 0,
    hasSuffixes: withSuffix.length > 0,
    letters,
    numerics,
    suffixGroups,
    suffixes: Object.keys(suffixGroups).sort(),
  };
}

const LETTER_ORDER = [
  "XS", "S", "M", "L", "XL",
  "2XL", "XXL", "3XL", "XXXL", "4XL", "5XL",
  "6XL", "7XL", "8XL",
];

export function sortLetterValues(values: ClassifiedValue[]): ClassifiedValue[] {
  return [...values].sort((a, b) => {
    const ai = LETTER_ORDER.indexOf(a.value.name.toUpperCase());
    const bi = LETTER_ORDER.indexOf(b.value.name.toUpperCase());
    if (ai === -1 && bi === -1) return a.value.name.localeCompare(b.value.name);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}
