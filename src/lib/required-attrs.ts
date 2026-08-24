export interface RequiredAttrFamily {
  key: string;
  label: string;
  names: string[];
}

export const REQUIRED_ATTR_FAMILIES: RequiredAttrFamily[] = [
  { key: "marca", label: "Marca", names: ["marca"] },
];

/** Returns the families missing from a given article's attributes. */
export function getMissingRequiredFamilies(
  attributes: Array<{ attributeName: string; values: unknown[] }>,
): RequiredAttrFamily[] {
  return REQUIRED_ATTR_FAMILIES.filter(
    (family) =>
      !attributes.some(
        (attr) =>
          family.names.some((n) =>
            attr.attributeName.toLowerCase().includes(n),
          ) && attr.values.length > 0,
      ),
  );
}
