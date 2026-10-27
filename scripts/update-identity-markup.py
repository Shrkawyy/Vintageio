"""Apply the Vintage signature, title studio and loading screen markup once."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'public'
p=root/'index.html';html=p.read_text(encoding='utf-8')
html=html.replace('<title>VINTAGE.IO - Dual Archive Test</title>','<title>VINTAGE.IO</title>')
html=html.replace('<body class="show-lobby">','''<body class="show-lobby booting">
  <section id="boot-screen" class="boot-screen" aria-label="Loading Vintage" aria-live="polite">
    <div class="boot-landscape" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="boot-header"><span>VINTAGE.IO</span><span>THE ORIGINAL CELL EXPERIENCE</span></div>
    <div class="boot-center"><div class="boot-seal" aria-hidden="true"><div class="boot-orbit"></div><div class="boot-orbit boot-orbit-inner"></div><div class="boot-diamond"></div></div><img class="boot-logo" src="/assets/vintage-logo.png" alt="Vintage"><p class="boot-caption">A LEGACY IN MOTION</p><div class="boot-progress-head"><span id="boot-stage">PREPARING YOUR WORLD</span><output id="boot-percent">0%</output></div><div id="boot-progress" class="boot-progress" role="progressbar" aria-label="Preparing game files" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="boot-fill"></i></div><p id="boot-detail">Loading the Vintage experience...</p><button id="boot-retry" type="button" hidden>RETRY LOADING</button></div>
    <div class="boot-footer"><span>FFA / DUAL / MEGA</span><span>YOUR NEXT CHAPTER STARTS HERE</span></div>
  </section>''')
html=html.replace('  <link rel="stylesheet" href="/collection.css?v=3-unified" />','  <link rel="stylesheet" href="/collection.css?v=vintage-identity-oct27-5" />\n  <link rel="stylesheet" href="/identity.css?v=vintage-identity-oct27-5" />')
html=html.replace('<button id="coin-shop-btn" type="button">&#9673; COIN SHOP</button>','')
start=html.index('  <div id="collection-overlay"');end=html.index('  <div id="skins-overlay"',start)
html=html[:start]+'''  <div id="collection-overlay" class="overlay hidden" role="dialog" aria-modal="true" aria-labelledby="collection-title">
    <section class="collection-shell">
      <header class="collection-header"><div><small>VINTAGE / MAKE YOUR MARK</small><h1 id="collection-title">Signature Studio</h1></div><div class="collection-header-actions"><span id="collection-balance" class="collection-balance">0 COINS</span><button id="collection-close" class="icon-btn" type="button" aria-label="Close signature studio">&#10005;</button></div></header>
      <div id="collection-names" class="collection-names">
        <div><div class="collection-owned-heading"><h2>Your locked names</h2><small id="collection-free-changes">One free name change included</small></div><div id="reserved-names-list"></div><div class="signature-note"><span>01 / STATIC</span><p>One color. A lasting impression.</p><span>02 / MOTION</span><p>Four colors, moving together.</p></div></div>
        <form id="reserved-name-form" class="reserved-name-editor"><small>DESIGN YOUR SIGNATURE</small><div id="reserved-name-preview" class="reserved-name-preview">Your signature</div><label>PLAYER NAME<input id="reserved-name-input" type="text" placeholder="Choose your name" minlength="2" maxlength="18" required autocomplete="off"></label><label>COLOR MODE<select id="reserved-name-mode"><option value="static">Static / one color</option><option value="animated">Animated / four colors</option></select></label><div class="signature-palette"><label>COLOR 1<input id="reserved-name-color" type="color" value="#70e0ff"></label><div id="signature-extra-colors" hidden><label>COLOR 2<input id="reserved-name-color-1" type="color" value="#b58aff"></label><label>COLOR 3<input id="reserved-name-color-2" type="color" value="#ff70b8"></label><label>COLOR 4<input id="reserved-name-color-3" type="color" value="#ffd580"></label></div></div><p id="reserved-style-hint"></p><button id="reserve-name-submit" class="collection-primary" type="submit">LOCK NAME / 15,000 COINS</button><button id="reserved-style-trial" class="collection-link" type="button" hidden>TRY FREE ON LOCALHOST</button><button id="reserved-name-cancel" class="collection-link" type="button" hidden>Cancel edit</button></form>
      </div>
      <footer class="collection-footer"><p>15,000 coins per locked name / one free name change<br>Both color modes are included. Color updates are free.</p><button id="collection-view-titles" class="collection-link" type="button">EXPLORE TITLES &#8599;</button></footer><p id="collection-status" role="status" aria-live="polite"></p>
    </section>
  </div>

'''+html[end:]
html=html.replace('</span> Flags</button></div>','</span> Flags</button><button id="skins-tab-titles" type="button" data-skin-tab="titles" role="tab" aria-selected="false"><span aria-hidden="true">&#10022;</span> Titles</button></div>')
html=html.replace('<div id="skins-grid" class="skins-grid"></div>','<div id="skins-grid" class="skins-grid"></div><div id="title-catalog-grid" class="title-catalog-grid" hidden></div>')
html=html.replace('<aside class="skins-preview-panel"','<aside class="skins-preview-panel" id="skins-preview-panel"')
marker='<div id="skin-live-preview" class="skin-live-preview"></div>'
html=html.replace(marker,'''<section id="title-studio" class="title-studio" hidden><small>YOUR INSIGNIA / YOUR POSITION</small><canvas id="title-position-canvas" width="600" height="600" tabindex="0" aria-label="Drag to position your title inside the cell. Arrow keys move the title." role="img"></canvas><h3 id="title-selected-name">Choose your title</h3><p id="title-selected-description">Drag inside the live cell to place your title.</p><button id="title-position-reset" type="button" class="title-studio-reset">RESET POSITION</button><button id="title-equip" type="button" class="collection-primary">EQUIP TITLE</button><button id="title-trial" type="button" class="collection-link" hidden>TRY FREE ON LOCALHOST</button><button id="title-remove" type="button" class="collection-link">REMOVE TITLE</button><p id="title-studio-status" role="status" aria-live="polite"></p><small>Drag or use arrow keys. Your position is saved for this connection.</small></section>'''+marker)
html=html.replace('/client.js?v=mega-feed-oct27-4','/boot.js?v=vintage-identity-oct27-5')
p.write_text(html,encoding='utf-8',newline='\n');(root/'game.html').write_text(html,encoding='utf-8',newline='\n')
