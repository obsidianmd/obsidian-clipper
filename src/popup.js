import TurndownService from 'turndown';
import { Readability } from '@mozilla/readability';

document.getElementById('clipButton').addEventListener('click', function() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: "getPageContent"}, function(response) {
      if (response && response.content) {
        processContent(response.content, tabs[0].url);
      }
    });
  });
});

function processContent(content, url) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');

  /* Optional vault name */
  const vault = "";

  /* Optional folder name such as "Clippings/" */
  const folder = "Clippings/";

  /* Optional tags  */
  let tags = "clippings";

  /* Parse the site's meta keywords content into tags, if present */
  if (doc.querySelector('meta[name="keywords" i]')) {
    var keywords = doc.querySelector('meta[name="keywords" i]').getAttribute('content').split(',');
    keywords.forEach(function(keyword) {
      let tag = ' ' + keyword.split(' ').join('');
      tags += tag;
    });
  }

  const { title, byline, content: readableContent } = new Readability(doc).parse();

  const fileName = getFileName(title);

  const markdownBody = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  }).turndown(readableContent);

  const today = convertDate(new Date());

  // Fetch byline, meta author, property author, or site name
  var author = byline || getMetaContent(doc, "name", "author") || getMetaContent(doc, "property", "author") || getMetaContent(doc, "property", "og:site_name");

  // Check if there's an author and add brackets
  var authorBrackets = author ? `"[[${author}]]"` : "";

  /* Try to get published date */
  var timeElement = doc.querySelector("time");
  var publishedDate = timeElement ? timeElement.getAttribute("datetime") : "";
  var published = '';
  if (publishedDate && publishedDate.trim() !== "") {
    var date = new Date(publishedDate);
    var year = date.getFullYear();
    var month = (date.getMonth() + 1).toString().padStart(2, '0');
    var day = date.getDate().toString().padStart(2, '0');
    published = `"[[${year}-${month}-${day}]]"`;
  }

  /* YAML front matter as tags render cleaner with special chars  */
  const fileContent = 
    '---\n'
    + 'category: "[[Clippings]]"\n'
    + 'author: ' + authorBrackets + '\n'
    + 'title: "' + title + '"\n'
    + 'source: ' + url + '\n'
    + 'created: "[[' + today + ']]"\n'
    + 'published: ' + published + '\n' 
    + 'topics: \n'
    + 'tags: [' + tags + ']\n'
    + '---\n\n'
    + markdownBody;

  saveToObsidian(fileContent, fileName, folder, vault);
}

function getFileName(fileName) {
  var userAgent = window.navigator.userAgent,
      platform = window.navigator.platform,
      windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'];

  if (windowsPlatforms.indexOf(platform) !== -1) {
    fileName = fileName.replace(':', '').replace(/[/\\?%*|"<>]/g, '-');
  } else {
    fileName = fileName.replace(':', '').replace(/\//g, '-').replace(/\\/g, '-');
  }
  return fileName;
}

function convertDate(date) {
  var yyyy = date.getFullYear().toString();
  var mm = (date.getMonth()+1).toString().padStart(2, '0');
  var dd = date.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getMetaContent(doc, attr, value) {
  var element = doc.querySelector(`meta[${attr}='${value}']`);
  return element ? element.getAttribute("content").trim() : "";
}

function saveToObsidian(fileContent, fileName, folder, vault) {
  const vaultParam = vault ? `&vault=${encodeURIComponent(vault)}` : '';
  const obsidianUrl = `obsidian://new?file=${encodeURIComponent(folder + fileName)}&content=${encodeURIComponent(fileContent)}${vaultParam}`;
  
  chrome.tabs.create({ url: obsidianUrl }, function(tab) {
    // You might want to close this tab after a short delay
    // setTimeout(() => chrome.tabs.remove(tab.id), 500);
  });
}