import path from "path";

export class VariableDynamicImportError extends Error {}

/* eslint-disable-next-line no-template-curly-in-string */
const example = "For example: import(`./foo/${bar}.js`).";

function sanitizeString(str) {
  if (str.includes("*")) {
    throw new VariableDynamicImportError(
      "A dynamic import cannot contain * characters."
    );
  }
  return str;
}

function templateLiteralToGlob(node) {
  let glob = "";

  for (let i = 0; i < node.quasis.length; i += 1) {
    glob += sanitizeString(node.quasis[i].value.raw);
    if (node.expressions[i]) {
      glob += expressionToGlob(node.expressions[i]);
    }
  }

  return glob;
}

function callExpressionToGlob(node) {
  const { callee } = node;
  if (
    callee.type === "MemberExpression" &&
    callee.property.type === "Identifier" &&
    callee.property.name === "concat"
  ) {
    return `${expressionToGlob(callee.object)}${node.arguments
      .map(expressionToGlob)
      .join("")}`;
  }
  return "*";
}

function binaryExpressionToGlob(node) {
  if (node.operator !== "+") {
    throw new VariableDynamicImportError(
      `${node.operator} operator is not supported.`
    );
  }

  return `${expressionToGlob(node.left)}${expressionToGlob(node.right)}`;
}

function expressionToGlob(node) {
  switch (node.type) {
    case "TemplateLiteral":
      return templateLiteralToGlob(node);
    case "CallExpression":
      return callExpressionToGlob(node);
    case "BinaryExpression":
      return binaryExpressionToGlob(node);
    case "Literal": {
      return sanitizeString(node.value);
    }

    default:
      return "**";
  }
}

function makeGlobPatternRecursive(glob = "") {
  let newGlob = glob.replace(/\/\*\*\./g, "/**/*.");
  while ([...newGlob.matchAll(/\*\*\//g)].length > 1) {
    newGlob = newGlob.replace(/\*\*\//, "");
  }

  // 'file-name-**/*.js' -> 'file-name-*/**/*.js'
  newGlob = newGlob.replace(/[^\/]\*\*\//g, (match) => {
    return `${match[0]}*/**`;
  });

  // Replace if there are more than two Asteriks
  // in one place, e.g. '/****'
  newGlob = newGlob.replace(/(\*){2,}/, "**");
  newGlob = newGlob.replace(/(\*){2,}\./, "*.");

  return newGlob;
}

export function dynamicImportToGlob(node, sourceString) {
  let glob = expressionToGlob(node);

  if (!glob.includes("*")) {
    return null;
  }

  // glob = glob.replace(/\*\*/g, "*");
  glob = makeGlobPatternRecursive(glob);
  console.log({ glob });

  if (glob.startsWith("*")) {
    throw new VariableDynamicImportError(
      `invalid import "${sourceString}". It cannot be statically analyzed. Variable dynamic imports must start with ./ and be limited to a specific directory. ${example}`
    );
  }

  if (glob.startsWith("/")) {
    throw new VariableDynamicImportError(
      `invalid import "${sourceString}". Variable absolute imports are not supported, imports must start with ./ in the static part of the import. ${example}`
    );
  }

  if (!glob.startsWith("./") && !glob.startsWith("../")) {
    throw new VariableDynamicImportError(
      `invalid import "${sourceString}". Variable bare imports are not supported, imports must start with ./ in the static part of the import. ${example}`
    );
  }

  // Disallow ./*.ext
  // const ownDirectoryStarExtension = /^\.\/\*\.[\w]+$/;
  // if (ownDirectoryStarExtension.test(glob)) {
  //   throw new VariableDynamicImportError(
  //     `${
  //       `invalid import "${sourceString}". Variable imports cannot import their own directory, ` +
  //       "place imports in a separate directory or make the import filename more specific. "
  //     }${example}`
  //   );
  // }

  if (path.extname(glob) === "") {
    throw new VariableDynamicImportError(
      `invalid import "${sourceString}". A file extension must be included in the static part of the import. ${example}`
    );
  }

  return glob;
}
