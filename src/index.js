// Зашифрованная конфигурация
const CONFIG = {
  // Base64 закодированный URL целевого сайта
  target: atob('aHR0cHM6Ly9sb2ZpcmFkaW8ucnUv'),
  // Заголовки для маскировки
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  }
};

// Функция для обфускации URL
function obfuscateUrl(url) {
  return url.replace(/https?:\/\/[^\/]+/, '');
}

// Функция для деобфускации URL
function deobfuscateUrl(path, baseUrl) {
  if (path.startsWith('http')) return path;
  if (path.startsWith('//')) return 'https:' + path;
  if (path.startsWith('/')) return baseUrl.replace(/\/$/, '') + path;
  return baseUrl.replace(/\/$/, '') + '/' + path;
}

// Основная функция обработки запросов
async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    const targetUrl = CONFIG.target.replace(/\/$/, '') + url.pathname + url.search;
    
    // Создаем новый запрос к целевому сайту
    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: {
        ...CONFIG.headers,
        ...Object.fromEntries(
          [...request.headers.entries()].filter(([key]) => 
            !['host', 'origin', 'referer'].includes(key.toLowerCase())
          )
        ),
        'Host': new URL(CONFIG.target).host,
        'Origin': CONFIG.target,
        'Referer': CONFIG.target
      },
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined
    });

    // Получаем ответ от целевого сайта
    const response = await fetch(modifiedRequest);
    
    // Клонируем ответ для модификации
    let modifiedResponse;
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('text/html')) {
      // Обрабатываем HTML контент
      let html = await response.text();
      
      // Заменяем все ссылки на целевой домен на наш домен
      const targetDomain = new URL(CONFIG.target).hostname;
      const ourDomain = url.hostname;
      
      html = html.replace(new RegExp(`https?://${targetDomain.replace('.', '\\.')}`, 'g'), `https://${ourDomain}`);
      html = html.replace(new RegExp(`//${targetDomain.replace('.', '\\.')}`, 'g'), `//${ourDomain}`);
      
      // Заменяем относительные ссылки
      html = html.replace(/href="\/([^"]*?)"/g, `href="/$1"`);
      html = html.replace(/src="\/([^"]*?)"/g, `src="/$1"`);
      
      // Добавляем базовый тег для корректной работы относительных ссылок
      html = html.replace(/<head>/i, `<head><base href="https://${ourDomain}/">`);
      
      modifiedResponse = new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } else if (contentType.includes('text/css')) {
      // Обрабатываем CSS файлы
      let css = await response.text();
      const targetDomain = new URL(CONFIG.target).hostname;
      const ourDomain = url.hostname;
      
      css = css.replace(new RegExp(`https?://${targetDomain.replace('.', '\\.')}`, 'g'), `https://${ourDomain}`);
      css = css.replace(/url\(["']?\/([^"')]*?)["']?\)/g, `url("/$1")`);
      
      modifiedResponse = new Response(css, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } else {
      // Для остальных типов контента просто проксируем
      modifiedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }
    
    // Модифицируем заголовки ответа
    const headers = new Headers(modifiedResponse.headers);
    
    // Удаляем заголовки, которые могут вызвать проблемы
    headers.delete('content-security-policy');
    headers.delete('x-frame-options');
    headers.delete('strict-transport-security');
    
    // Добавляем CORS заголовки
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', '*');
    
    // Устанавливаем правильный домен в cookies
    const setCookie = headers.get('set-cookie');
    if (setCookie) {
      const targetDomain = new URL(CONFIG.target).hostname;
      const ourDomain = url.hostname;
      const modifiedCookie = setCookie.replace(
        new RegExp(`domain=${targetDomain.replace('.', '\\.')}`, 'gi'),
        `domain=${ourDomain}`
      );
      headers.set('set-cookie', modifiedCookie);
    }
    
    return new Response(modifiedResponse.body, {
      status: modifiedResponse.status,
      statusText: modifiedResponse.statusText,
      headers: headers
    });
    
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(`Proxy Error: ${error.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Обработчик OPTIONS запросов для CORS
async function handleOptions() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400'
    }
  });
}

// Главный обработчик событий
addEventListener('fetch', event => {
  if (event.request.method === 'OPTIONS') {
    event.respondWith(handleOptions());
  } else {
    event.respondWith(handleRequest(event.request));
  }
});

// Экспорт для модульной системы
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return handleOptions();
    }
    return handleRequest(request);
  }
};