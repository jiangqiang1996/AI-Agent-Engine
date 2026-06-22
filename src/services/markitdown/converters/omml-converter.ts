import { parseXml, type SimpleXmlNode } from '../xml-parser.js'

/**
 * OMML (Office Math Markup Language) 转 LaTeX
 *
 * 支持 m:r/m:t（文本）、m:f（分式）、m:sSup（上标）、m:sSub（下标）、
 * m:rad（根式）、m:nary（累加/积分）、m:d（定界符）等常见结构。
 * 复杂结构降级为提取纯文本。
 */
export function ommlToLatex(ommlXml: string): string {
  try {
    // xmldom 要求命名空间前缀必须有声明。
    // DOCX 中的 OMML 通过正则提取时缺少 xmlns 声明（m:、w: 等），
    // 需要包裹一个带命名空间声明的根元素后再解析。
    const wrappedXml = `<root xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">${ommlXml}</root>`
    const doc = parseXml(wrappedXml)
    const latex = convertNode(doc)
    return `$${latex.trim()}$`
  } catch {
    const texts = extractMathText(ommlXml)
    return texts.length > 0 ? `$${texts}$` : ''
  }
}

function getLocalName(node: SimpleXmlNode): string {
  const parts = (node.tagName || '').split(':')
  return parts[parts.length - 1]
}

function convertNode(node: SimpleXmlNode): string {
  const localName = getLocalName(node)

  switch (localName) {
    case 'oMath':
    case 'oMathPara':
      return convertChildren(node)
    case 'r':
      return convertRun(node)
    case 't':
      return node.textContent || ''
    case 'f':
      return convertFraction(node)
    case 'sSup':
      return convertSuperscript(node)
    case 'sSub':
      return convertSubscript(node)
    case 'sSubSup':
      return convertSubSuperscript(node)
    case 'rad':
      return convertRadical(node)
    case 'nary':
      return convertNary(node)
    case 'd':
      return convertDelimiter(node)
    case 'eqArr':
      return convertEquationArray(node)
    case 'acc':
      return convertAccent(node)
    case 'bar':
      return convertBar(node)
    default:
      return convertChildren(node)
  }
}

function convertChildren(node: SimpleXmlNode): string {
  return node.childNodes.map((child) => convertNode(child)).join('')
}

function convertRun(node: SimpleXmlNode): string {
  return node.childNodes
    .filter((child) => getLocalName(child) === 't')
    .map((child) => child.textContent || '')
    .join('')
}

function findChild(node: SimpleXmlNode, localName: string): SimpleXmlNode | undefined {
  return node.childNodes.find((child) => getLocalName(child) === localName)
}

function convertFraction(node: SimpleXmlNode): string {
  const num = findChild(node, 'num')
  const den = findChild(node, 'den')
  const numLatex = num ? convertChildren(num) : ''
  const denLatex = den ? convertChildren(den) : ''
  return `\\frac{${numLatex}}{${denLatex}}`
}

function convertSuperscript(node: SimpleXmlNode): string {
  const e = findChild(node, 'e')
  const sup = findChild(node, 'sup')
  const eLatex = e ? convertChildren(e) : ''
  const supLatex = sup ? convertChildren(sup) : ''
  return `${eLatex}^{${supLatex}}`
}

function convertSubscript(node: SimpleXmlNode): string {
  const e = findChild(node, 'e')
  const sub = findChild(node, 'sub')
  const eLatex = e ? convertChildren(e) : ''
  const subLatex = sub ? convertChildren(sub) : ''
  return `${eLatex}_{${subLatex}}`
}

function convertSubSuperscript(node: SimpleXmlNode): string {
  const e = findChild(node, 'e')
  const sub = findChild(node, 'sub')
  const sup = findChild(node, 'sup')
  const eLatex = e ? convertChildren(e) : ''
  const subLatex = sub ? convertChildren(sub) : ''
  const supLatex = sup ? convertChildren(sup) : ''
  return `${eLatex}_{${subLatex}}^{${supLatex}}`
}

function convertRadical(node: SimpleXmlNode): string {
  const deg = findChild(node, 'deg')
  const e = findChild(node, 'e')
  const eLatex = e ? convertChildren(e) : ''
  if (deg) {
    const degLatex = convertChildren(deg)
    return `\\sqrt[${degLatex}]{${eLatex}}`
  }
  return `\\sqrt{${eLatex}}`
}

function convertNary(node: SimpleXmlNode): string {
  const naryPr = findChild(node, 'naryPr')
  const chrNode = naryPr ? findChild(naryPr, 'chr') : undefined
  const chr = chrNode?.attributes?.['m:val'] || chrNode?.attributes?.['val'] || ''
  const e = findChild(node, 'e')
  const sub = findChild(node, 'sub')
  const sup = findChild(node, 'sup')

  const symbol = mapNarySymbol(chr)
  const subLatex = sub ? `_{${convertChildren(sub)}}` : ''
  const supLatex = sup ? `^{${convertChildren(sup)}}` : ''
  const eLatex = e ? convertChildren(e) : ''

  return `${symbol}${subLatex}${supLatex} ${eLatex}`
}

function mapNarySymbol(chr: string): string {
  switch (chr) {
    case '\u2211':
      return '\\sum'
    case '\u222B':
      return '\\int'
    case '\u220F':
      return '\\prod'
    case '\u22C3':
      return '\\bigcup'
    case '\u22C2':
      return '\\bigcap'
    default:
      return chr || '\\sum'
  }
}

function convertDelimiter(node: SimpleXmlNode): string {
  const e = findChild(node, 'e')
  const eLatex = e ? convertChildren(e) : ''
  return `\\left(${eLatex}\\right)`
}

function convertEquationArray(node: SimpleXmlNode): string {
  const rows = node.childNodes
    .filter((child) => getLocalName(child) === 'e')
    .map((child) => convertChildren(child))
  return `\\begin{matrix}${rows.join(' \\\\ ')}\\end{matrix}`
}

function convertAccent(node: SimpleXmlNode): string {
  const accPr = findChild(node, 'accPr')
  const chrNode = accPr ? findChild(accPr, 'chr') : undefined
  const chr = chrNode?.attributes?.['m:val'] || ''
  const e = findChild(node, 'e')
  const eLatex = e ? convertChildren(e) : ''

  switch (chr) {
    case '\u0302':
      return `\\hat{${eLatex}}`
    case '\u0303':
      return `\\tilde{${eLatex}}`
    case '\u20D7':
      return `\\vec{${eLatex}}`
    case '\u0304':
      return `\\bar{${eLatex}}`
    case '\u0307':
      return `\\dot{${eLatex}}`
    case '\u0308':
      return `\\ddot{${eLatex}}`
    default:
      return `\\hat{${eLatex}}`
  }
}

function convertBar(node: SimpleXmlNode): string {
  const e = findChild(node, 'e')
  const eLatex = e ? convertChildren(e) : ''
  return `\\overline{${eLatex}}`
}

function extractMathText(xml: string): string {
  const matches = xml.match(/<m:t[^>]*>([\s\S]*?)<\/m:t>/g) || []
  return matches
    .map((m) => m.replace(/<m:t[^>]*>/, '').replace(/<\/m:t>/, ''))
    .join('')
}
