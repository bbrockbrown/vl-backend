module.exports = {
  trailingComma: 'es5',
  tabWidth: 2,
  semi: true,
  singleQuote: true,
  printWidth: 100,
  jsxSingleQuote: true,
  proseWrap: 'always',
  importOrder: [
    '^react$',
    '<THIRD_PARTY_MODULES>',
    '^(common|pages)/(.*)$',
    '^[./]',
  ],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
}