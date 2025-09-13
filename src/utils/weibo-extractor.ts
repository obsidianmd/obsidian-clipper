import { getDomain } from './string-utils'

/**
 * 解析微博时间格式并转换为 yyyy-MM-dd HH:mm 格式
 */
function formatWeiboTime(timeStr: string): string {
  if (!timeStr) return ''

  // 处理各种微博时间格式
  try {
    // 如果是相对时间（如"刚刚"、"5分钟前"、"今天 14:30"等）
    if (timeStr.includes('刚刚')) {
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    }

    if (timeStr.includes('分钟前')) {
      const minutes = parseInt(timeStr.match(/(\d+)分钟前/)?.[1] || '0')
      const date = new Date(Date.now() - minutes * 60 * 1000)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }

    if (timeStr.includes('小时前')) {
      const hours = parseInt(timeStr.match(/(\d+)小时前/)?.[1] || '0')
      const date = new Date(Date.now() - hours * 60 * 60 * 1000)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }

    if (timeStr.includes('今天')) {
      const timeMatch = timeStr.match(/今天\s*(\d{1,2}):(\d{2})/)
      if (timeMatch) {
        const now = new Date()
        const hours = timeMatch[1].padStart(2, '0')
        const minutes = timeMatch[2]
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${hours}:${minutes}`
      }
    }

    if (timeStr.includes('昨天')) {
      const timeMatch = timeStr.match(/昨天\s*(\d{1,2}):(\d{2})/)
      if (timeMatch) {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const hours = timeMatch[1].padStart(2, '0')
        const minutes = timeMatch[2]
        return `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')} ${hours}:${minutes}`
      }
    }

    // 处理完整日期格式 (如 "2025-01-13 14:30" 或 "2025年1月13日 14:30")
    const fullDateMatch = timeStr.match(/(\d{4})[-年](\d{1,2})[-月](\d{1,2})[日]?\s*(\d{1,2}):(\d{2})/)
    if (fullDateMatch) {
      const year = fullDateMatch[1]
      const month = fullDateMatch[2].padStart(2, '0')
      const day = fullDateMatch[3].padStart(2, '0')
      const hours = fullDateMatch[4].padStart(2, '0')
      const minutes = fullDateMatch[5]
      return `${year}-${month}-${day} ${hours}:${minutes}`
    }

    // 处理短日期格式 (如 "24-9-10 20:00")
    const shortDateMatch = timeStr.match(/(\d{2})[-年](\d{1,2})[-月](\d{1,2})[日]?\s*(\d{1,2}):(\d{2})/)
    if (shortDateMatch) {
      let year = parseInt(shortDateMatch[1])
      // 如果年份是两位数，需要判断是20xx还是19xx
      // 一般来说，如果大于当前年份的后两位，认为是上个世纪
      const currentYear = new Date().getFullYear()
      const currentYearShort = currentYear % 100
      if (year <= currentYearShort + 10) { // 假设不会有超过当前年份10年的时间
        year = 2000 + year
      } else {
        year = 1900 + year
      }
      const month = shortDateMatch[2].padStart(2, '0')
      const day = shortDateMatch[3].padStart(2, '0')
      const hours = shortDateMatch[4].padStart(2, '0')
      const minutes = shortDateMatch[5]
      return `${year}-${month}-${day} ${hours}:${minutes}`
    }

    // 如果都不匹配，尝试解析为Date对象
    const date = new Date(timeStr)
    if (!isNaN(date.getTime())) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }

    // 如果解析失败，返回原始字符串
    return timeStr
  } catch (error) {
    console.warn('时间格式化失败:', timeStr, error)
    return timeStr
  }
}

interface WeiboContent {
  author: string
  authorUrl: string
  publishTime: string
  content: string
  images: string[]
  videos: string[]
  url: string
  isRepost: boolean
  originalContent: string
  originalAuthor: string
  location: string
  wordCount: number
}

/**
 * 检查当前页面是否为微博详情页
 */
export function isWeiboDetailPage(url: string): boolean {
  const domain = getDomain(url)
  if (!domain.includes('weibo.com')) {
    return false
  }

  // 匹配类似 https://weibo.com/2142708050/Q4cIlCUJo 或 https://weibo.com/2142708050/5210021899274542 的格式
  const detailPagePattern = /weibo\.com\/\d+\/[A-Za-z0-9]+$/
  return detailPagePattern.test(url)
}

/**
 * 清理文本，移除多余的空白字符但保留换行
 */
function cleanText(text: string): string {
  if (!text) return ''
  // 保留换行符，但清理其他多余空白字符
  return text
    .replace(/[ \t]+/g, ' ') // 多个空格/制表符合并为单个空格
    .replace(/\n{3,}/g, '\n\n') // 多个换行符最多保留两个
    .trim()
}

/**
 * 提取微博内容
 */
export function extractWeiboContent(document: Document): WeiboContent {
  const weiboData: WeiboContent = {
    author: '',
    authorUrl: '',
    publishTime: '',
    content: '',
    images: [],
    videos: [],
    url: document.URL,
    isRepost: false,
    originalContent: '',
    originalAuthor: '',
    location: '',
    wordCount: 0
  }

  // 基于实际DOM结构的作者选择器
  const authorSelectors = [
    '.head_name_24eEB span',
    '.head_name_24eEB',
    'a[usercard] span[title]',
    'a[href*="/u/"] span[title]',
    '.ALink_default_2ibt1 span[title]'
  ]

  for (const selector of authorSelectors) {
    const authorElement = document.querySelector(selector) as HTMLElement
    if (authorElement && authorElement.textContent?.trim()) {
      weiboData.author = cleanText(authorElement.textContent)
      const linkElement = authorElement.closest('a') as HTMLAnchorElement
      weiboData.authorUrl = linkElement?.href || ''
      break
    }
  }

  // 基于实际DOM结构的时间选择器
  const timeSelectors = ['.head-info_time_6sFQg', 'a[href*="/PiLYu"]', 'a[title*="25-"]', '.head-info_info_2AspQ a']

  for (const selector of timeSelectors) {
    const timeElement = document.querySelector(selector) as HTMLElement
    if (timeElement && (timeElement.textContent?.trim() || timeElement.title)) {
      const rawTime = cleanText(timeElement.textContent || timeElement.title || '')
      weiboData.publishTime = formatWeiboTime(rawTime)
      break
    }
  }

  // 位置信息已移除 - 不获取位置信息

  // 基于实际DOM结构的内容选择器
  const contentSelectors = [
    '.detail_wbtext_4CRf9',
    '.detail_text_1U10O',
    '.wbpro-feed-content .detail_wbtext_4CRf9',
    '.detail_ogText_2Z1Q8'
  ]

  for (const selector of contentSelectors) {
    const contentElement = document.querySelector(selector) as HTMLElement
    if (contentElement && contentElement.textContent?.trim()) {
      // 提取纯文本，但保留链接信息和换行格式 - 参考油猴脚本的逻辑
      let contentText = ''

      // 先将<br>标签替换为换行符，保留原有的换行结构
      let htmlContent = contentElement.innerHTML
      htmlContent = htmlContent.replace(/<br\s*\/?>/gi, '\n')

      // 创建临时元素来解析HTML
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = htmlContent

      // 遍历所有子节点，递归处理
      function processNode(node: Node): string {
        let result = ''

        if (node.nodeType === Node.TEXT_NODE) {
          result += node.textContent || ''
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement

          if (element.tagName === 'A') {
            const linkText = element.textContent
            const href = (element as HTMLAnchorElement).href
            if (linkText && href && href !== document.URL) {
              result += `[${linkText}](${href})`
            } else {
              result += linkText
            }
          } else {
            // 递归处理子节点
            for (let child of Array.from(element.childNodes)) {
              result += processNode(child)
            }
          }
        }

        return result
      }

      contentText = processNode(tempDiv)
      weiboData.content = cleanText(contentText)
      break
    }
  }

  // 如果还是没找到内容，尝试更通用的方法
  if (!weiboData.content) {
    const allTextElements = document.querySelectorAll('div, p, span')
    const foundElement = Array.from(allTextElements).find(element => {
      const text = element.textContent?.trim() || ''
      return (
        text.length > 10 &&
        text.length < 2000 &&
        !text.includes('转发') &&
        !text.includes('评论') &&
        !text.includes('赞') &&
        !text.includes('关注') &&
        !text.includes('粉丝')
      )
    })

    if (foundElement) {
      weiboData.content = cleanText(foundElement.textContent || '')
    }
  }

  // 检查是否为转发微博
  const repostSelectors = [
    '.WB_expand_media',
    '.Feed_retweet',
    '.WB_feed_expand',
    '[node-type="feed_list_forwardContent"]',
    '.quote',
    '.retweet'
  ]

  let repostElement: Element | null = null
  for (const selector of repostSelectors) {
    repostElement = document.querySelector(selector)
    if (repostElement) {
      break
    }
  }

  if (repostElement) {
    weiboData.isRepost = true

    // 获取原博内容
    const originalContentElement =
      repostElement.querySelector('.WB_text') ||
      repostElement.querySelector('.weibo-text') ||
      repostElement.querySelector('.text')
    if (originalContentElement) {
      weiboData.originalContent = cleanText(originalContentElement.textContent || '')
    }

    // 获取原博作者
    const originalAuthorElement =
      repostElement.querySelector('[usercard] .W_fb') ||
      repostElement.querySelector('.WB_info .W_fb') ||
      repostElement.querySelector('.username') ||
      repostElement.querySelector('.screen-name')
    if (originalAuthorElement) {
      weiboData.originalAuthor = cleanText(originalAuthorElement.textContent || '')
    }
  }

  // 基于实际DOM结构获取图片
  const imageElements = document.querySelectorAll(
    '.picture .woo-picture-img, .picture_pic_eLDxR img'
  ) as NodeListOf<HTMLImageElement>

  imageElements.forEach(img => {
    let imgSrc = img.src
    // 转换为高清图片
    if (imgSrc.includes('orj360')) {
      imgSrc = imgSrc.replace('orj360', 'large')
    } else if (imgSrc.includes('thumbnail') || imgSrc.includes('bmiddle')) {
      imgSrc = imgSrc.replace('thumbnail', 'large').replace('bmiddle', 'large')
    }
    if (imgSrc && !weiboData.images.includes(imgSrc) && imgSrc.includes('sinaimg')) {
      weiboData.images.push(imgSrc)
    }
  })

  // 获取视频信息
  const videoElements = document.querySelectorAll('video, [data-video], .video') as NodeListOf<HTMLElement>
  videoElements.forEach(video => {
    const videoSrc = (video as HTMLVideoElement).src || video.dataset.video || video.dataset.src
    if (videoSrc && !weiboData.videos.includes(videoSrc)) {
      weiboData.videos.push(videoSrc)
    }
  })

  // 计算字数
  weiboData.wordCount = weiboData.content.length

  console.log('微博内容提取完成:', {
    author: weiboData.author,
    contentLength: weiboData.content.length,
    hasImages: weiboData.images.length > 0,
    isRepost: weiboData.isRepost
  })
  return weiboData
}

/**
 * 将微博内容转换为Defuddle兼容的格式
 */
export function convertWeiboToDefuddleFormat(weiboData: WeiboContent): {
  author: string
  content: string
  description: string
  title: string
  published: string
  site: string
  wordCount: number
  image: string
} {
  // 构建内容
  let content = ''

  // 将换行符转换为HTML <br> 标签，因为内容会经过markdown转换器
  const contentWithBr = weiboData.content.replace(/\n/g, '<br>')
  const originalContentWithBr = weiboData.originalContent ? weiboData.originalContent.replace(/\n/g, '<br>') : ''

  if (weiboData.isRepost && weiboData.originalContent) {
    content += `<strong>转发内容：</strong><br><br>${contentWithBr}<br><br>`
    content += `<strong>原博内容：</strong><br><br>`
    if (weiboData.originalAuthor) {
      content += `原博作者：${weiboData.originalAuthor}<br><br>`
    }
    content += `${originalContentWithBr}<br><br>`
  } else {
    content += `${contentWithBr}<br><br>`
  }

  // 添加图片
  if (weiboData.images.length > 0) {
    weiboData.images.forEach((img) => {
      content += `<img src="${img}"><br><br>`
    })
  }

  // 添加视频
  if (weiboData.videos.length > 0) {
    content += `<strong>视频 (${weiboData.videos.length}个)：</strong><br><br>`
    weiboData.videos.forEach((video, index) => {
      content += `<a href="${video}">视频${index + 1}</a><br><br>`
    })
  }

  // 位置信息已移除

  // 生成标题
  const title = weiboData.content.substring(0, 50).replace(/[#\n\r]/g, '') || '微博内容'

  // 生成描述
  const description = weiboData.content.substring(0, 200)

  return {
    author: weiboData.author,
    content: content.trim(),
    description: description,
    title: title,
    published: weiboData.publishTime,
    site: '微博',
    wordCount: weiboData.wordCount,
    image: weiboData.images[0] || ''
  }
}
