import { DOMParser } from '@xmldom/xmldom'

export interface SimpleXmlNode {
  tagName: string
  attributes: Record<string, string>
  childNodes: SimpleXmlNode[]
  textContent: string
  data?: string
}

/** 防止恶意深层嵌套 XML 导致栈溢出 */
const MAX_XML_DEPTH = 100

/** xmldom Element 的最小结构类型，避免与 lib.dom.d.ts 的 Element 冲突 */
interface XmlDomElement {
  tagName: string
  attributes: NamedNodeMap
  childNodes: NodeList
}

/**
 * 使用 @xmldom/xmldom 库解析 XML 文本为 SimpleXmlNode 树。
 *
 * 实际的 XML 词法分析、实体解码、CDATA 处理、属性解析均由库完成。
 * 本模块仅负责将 DOM 树适配为 SimpleXmlNode 结构，供下游消费者使用。
 */
export function parseXml(xml: string): SimpleXmlNode {
  const cleaned = xml.replace(/^\uFEFF/, '')
  const parser = new DOMParser({
    onError: () => {},
  })

  let doc: ReturnType<DOMParser['parseFromString']> | null = null
  try {
    doc = parser.parseFromString(cleaned, 'text/xml')
  } catch {
    // xmldom 对致命错误（如缺少根元素）会抛出 ParseError，
    // 降级为空节点以匹配参考行为（不抛异常，返回空 markdown）
    return { tagName: '', attributes: {}, childNodes: [], textContent: '' }
  }
  if (!doc || !doc.documentElement) {
    return { tagName: '', attributes: {}, childNodes: [], textContent: '' }
  }

  return domToSimpleNode(doc.documentElement as unknown as XmlDomElement, 0)
}

/**
 * 将 DOM Element 递归转换为 SimpleXmlNode。
 * - 仅保留 Element 子节点（文本内容聚合为 textContent/data）
 * - 深度超过 MAX_XML_DEPTH 时截断，防止栈溢出
 */
function domToSimpleNode(element: XmlDomElement, depth: number): SimpleXmlNode {
  if (depth >= MAX_XML_DEPTH) {
    return { tagName: element.tagName, attributes: {}, childNodes: [], textContent: '' }
  }

  const tagName = element.tagName
  const attributes: Record<string, string> = {}
  const attrMap = element.attributes
  for (let i = 0; i < attrMap.length; i++) {
    const attr = attrMap.item(i)
    if (attr) {
      attributes[attr.name] = attr.value
    }
  }

  const childNodes: SimpleXmlNode[] = []
  const textParts: string[] = []

  const children = element.childNodes
  for (let i = 0; i < children.length; i++) {
    const child = children.item(i)
    if (!child) continue

    const nodeType = child.nodeType
    // Node.ELEMENT_NODE = 1
    if (nodeType === 1) {
      childNodes.push(domToSimpleNode(child as unknown as XmlDomElement, depth + 1))
    } else if (nodeType === 3 || nodeType === 4) {
      // Node.TEXT_NODE = 3, CDATA_SECTION_NODE = 4
      if (child.nodeValue) {
        textParts.push(child.nodeValue)
      }
    }
  }

  const textContent = textParts.join('')

  return {
    tagName,
    attributes,
    childNodes,
    textContent,
    data: textContent,
  }
}

export function getElementsByTagName(node: SimpleXmlNode, tagName: string): SimpleXmlNode[] {
  const result: SimpleXmlNode[] = []
  const stack: SimpleXmlNode[] = [node]
  while (stack.length > 0) {
    const n = stack.pop()!
    if (n.tagName === tagName || n.tagName.endsWith(`:${tagName}`)) {
      result.push(n)
    }
    // 逆序入栈，保证子节点按文档顺序（左到右）出栈
    for (let i = n.childNodes.length - 1; i >= 0; i--) {
      stack.push(n.childNodes[i])
    }
  }
  return result
}
