import TurndownService from 'turndown';
import { gfm, tables, strikethrough } from 'turndown-plugin-gfm';
import { Readability } from '@mozilla/readability';

document.getElementById('clipButton').addEventListener('click', function() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: "getPageContent"}, function(response) {
      if (response && response.content) {
        chrome.storage.sync.get(['vaultName', 'folderName', 'tags'], (data) => {
          processContent(response.content, tabs[0].url, data.vaultName, data.folderName, data.tags);
        });
      }
    });
  });
});

function processContent(content, url, vaultName = "", folderName = "Clippings/", tags = "clippings") {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');

  // Convert relative image URLs to absolute URLs
  const baseUrl = new URL(url);
  const images = doc.querySelectorAll('img');
  images.forEach(img => {
    const src = img.getAttribute('src');
    if (src && !src.startsWith('http')) {
      img.setAttribute('src', new URL(src, baseUrl).href);
    }
  });

  const { title, byline, content: readableContent } = new Readability(doc).parse();

  const fileName = getFileName(title);

  const turndownService = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });

  turndownService.use(gfm);

  const markdownBody = turndownService.turndown(readableContent);

  const today = convertDate(new Date());

  var author = byline || getMetaContent(doc, "name", "author") || getMetaContent(doc, "property", "author") || getMetaContent(doc, "property", "og:site_name");

  var authorBrackets = author ? `"[[${author}]]"` : "";

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

  saveToObsidian(fileContent, fileName, folderName, vaultName);
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
  });
}