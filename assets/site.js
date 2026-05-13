/* Global UI */
function toggleMenu() {
  const el = document.getElementById('navLinks');
  if (!el) return;
  el.classList.toggle('active');
}

document.addEventListener('click', (e) => {
  const nav = document.getElementById('navLinks');
  const link = e.target.closest?.('.nav-links a');
  const hamburger = e.target.closest?.('.hamburger');
  if (link) { nav?.classList.remove('active'); return; }
  if (hamburger) return;
  if (nav?.classList.contains('active') && !e.target.closest?.('.navbar')) nav.classList.remove('active');
});

window.addEventListener('resize', () => {
  if (window.matchMedia('(min-width:769px)').matches) {
    document.getElementById('navLinks')?.classList.remove('active');
  }
});

/** توحيد الاسم التجاري إن وُجدت نسخ قديمة في HTML */
function fixCompanyBrandingTypos() {
  const wrong = 'المصرية العالمية';
  const wrongAlt = 'المصرية العالميه';
  const right = 'يونيفيت للأدوية البيطرية';
  function fixText(t) {
    if (!t) return t;
    return String(t).replaceAll(wrongAlt, right).replaceAll(wrong, right);
  }
  document.title = fixText(document.title);
  document.querySelectorAll('.logo-text h1, .logo-text span, .footer h3').forEach((el) => {
    el.textContent = fixText(el.textContent);
  });
  document.querySelectorAll('meta[content]').forEach((m) => {
    const c = m.getAttribute('content');
    if (c && (c.includes(wrong) || c.includes(wrongAlt))) m.setAttribute('content', fixText(c));
  });
}

/* Cart (localStorage) */
const CART_KEY = 'eivp_cart_v1';
const PRODUCT_EDIT_KEY = 'eivp_product_edit_v1';
const BLOG_KEY = 'eivp_blog_posts_v1';

function readCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartBadges();
}

function clearCart() {
  // Remove key بالكامل بدل كتابة [] لتفادي أي بقايا قديمة.
  localStorage.removeItem(CART_KEY);
  updateCartBadges();
}

function addToCart(item) {
  const cart = readCart();
  const existing = cart.find((x) => x.id === item.id);
  if (existing) existing.qty += item.qty ?? 1;
  else cart.push({ ...item, qty: item.qty ?? 1 });
  writeCart(cart);
}

function cartCount() {
  return readCart().reduce((sum, x) => sum + (Number(x.qty) || 0), 0);
}

function updateCartBadges() {
  const count = cartCount();
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    el.textContent = String(count);
    el.style.display = count > 0 ? 'inline-flex' : 'none';
  });
}

/* Attach handlers to buttons */
document.addEventListener('click', (e) => {
  const btn = e.target.closest?.('[data-add-to-cart]');
  if (!btn) return;
  const id = btn.getAttribute('data-id') || `p_${Date.now()}`;
  const name = btn.getAttribute('data-name') || 'منتج';
  const category = btn.getAttribute('data-category') || '';
  const composition = btn.getAttribute('data-composition') || '';
  const usage = btn.getAttribute('data-usage') || '';
  const image = btn.getAttribute('data-image') || '';
  const discount = Number(btn.getAttribute('data-discount') || 0);
  // `data-price` هنا بنفترض إنها "السعر بعد الخصم" (علشان السلة/الإجمالي يبقى صحيح).
  const price = Number(btn.getAttribute('data-price') || 0);
  addToCart({
    id,
    name,
    category,
    composition,
    usage,
    image,
    discount,
    price,
    qty: 1,
  });
  btn.blur();
  btn.textContent = '✅ تمت الإضافة';
  setTimeout(() => (btn.textContent = 'أضف للسلة'), 1200);
});

function fmtMoney(n) {
  const num = Number(n || 0);
  return `${num.toFixed(0)} ج.م`;
}

function computeDiscountedPrice(price, discountPercent) {
  const p = Number(price) || 0;
  const d = Number(discountPercent) || 0;
  const clampedD = Math.min(100, Math.max(0, d));
  const discounted = p * (1 - clampedD / 100);
  return Math.max(0, Math.round(discounted));
}

/** يستخرج أول رقم عشري من نص (لأسطر السعر/الخصم في الكارت) */
function parseFirstNumberFromKvText(text) {
  const s = String(text || '').replace(/\s/g, ' ');
  const m = s.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return NaN;
  return Number(m[1].replace(',', '.'));
}

/** يقرأ من أسطر المنتج: السعر = قبل الخصم، الخصم = النسبة % */
function parseProductCardPriceAndDiscount(card) {
  const meta = card.querySelector('.product-meta');
  if (!meta) return { basePrice: NaN, discountPct: 0, priceKv: null, discountKv: null };

  let basePrice = NaN;
  let discountPct = 0;
  let priceKv = null;
  let discountKv = null;

  for (const kv of meta.querySelectorAll('.kv')) {
    if (kv.getAttribute('data-auto-final') === '1') continue;
    const lab = kv.querySelector('span')?.textContent?.trim() || '';
    if (lab.includes('الخصم')) {
      discountKv = kv;
      const p = parseFirstNumberFromKvText(kv.textContent);
      if (!Number.isNaN(p)) discountPct = p;
    } else if (lab.includes('السعر') && !lab.includes('بعد')) {
      priceKv = kv;
      basePrice = parseFirstNumberFromKvText(kv.textContent);
    }
  }
  return { basePrice, discountPct, priceKv, discountKv };
}

/**
 * يعرض «بعد الخصم» تلقائياً بجوار السعر والخصم، ويحدّث زر السلة بالسعر النهائي.
 * سطر «السعر» في HTML = السعر قبل الخصم (السلة تستخدم السعر بعد الخصم تلقائياً).
 * لا يُستدعى مع ?admin=1 حتى يعمل محرّر التعديل من الكارت بشكل صحيح.
 */
function initProductCardFinalPrices() {
  document.querySelectorAll('.product-card').forEach((card) => {
    const meta = card.querySelector('.product-meta');
    if (!meta) return;

    meta.querySelectorAll('.kv[data-auto-final="1"]').forEach((el) => el.remove());

    const { basePrice, discountPct, priceKv, discountKv } = parseProductCardPriceAndDiscount(card);
    if (Number.isNaN(basePrice)) return;

    const final = computeDiscountedPrice(basePrice, discountPct);
    const row = document.createElement('div');
    row.className = 'kv kv-final-price';
    row.setAttribute('data-auto-final', '1');
    row.innerHTML = `<span>بعد الخصم</span><strong class="kv-final-price-value">${fmtMoney(final)}</strong>`;

    if (discountKv) {
      discountKv.insertAdjacentElement('afterend', row);
    } else if (priceKv) {
      priceKv.insertAdjacentElement('afterend', row);
    } else {
      meta.appendChild(row);
    }

    const btn = card.querySelector('[data-add-to-cart]');
    if (btn) {
      btn.setAttribute('data-price', String(final));
      btn.setAttribute('data-discount', String(discountPct));
    }
  });
}

function getInitialText(card) {
  // Best-effort extraction from current card markup.
  const btn = card.querySelector('[data-add-to-cart]');
  const btnName = btn?.getAttribute('data-name');
  const name =
    btnName ||
    card.querySelector('h3')?.textContent?.trim() ||
    card.querySelector('strong')?.textContent?.trim() ||
    'منتج';

  // Composition/usage can exist in products.html (field-label/field-value) or be placeholders.
  let composition = '';
  let usage = '';

  card.querySelectorAll('.field-line').forEach((line) => {
    const label = line.querySelector('.field-label')?.textContent?.trim() || '';
    const value = line.querySelector('.field-value')?.textContent?.trim() || '';
    if (label.includes('التركيب')) composition = value === '—' ? '' : value;
    if (label.includes('الاستخدام')) usage = value === '—' ? '' : value;
  });

  return { name, composition, usage };
}

function parseInitialDiscount(card) {
  // products.html shows discount in `.kv` as: <span>الخصم</span> 10%
  const kvs = card.querySelectorAll('.kv');
  for (const kv of kvs) {
    const label = kv.querySelector('span')?.textContent?.trim() || '';
    if (!label.includes('الخصم')) continue;
    const m = kv.textContent.match(/(\d+(\.\d+)?)/);
    if (!m) continue;
    return Number(m[1]);
  }
  return 0;
}

function readProductEdit(id) {
  if (!id) return null;
  try {
    const raw = localStorage.getItem(`${PRODUCT_EDIT_KEY}_${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeProductEdit(id, data) {
  if (!id) return;
  localStorage.setItem(`${PRODUCT_EDIT_KEY}_${id}`, JSON.stringify(data));
}

function initProductEditors() {
  const cards = document.querySelectorAll('.product-card');
  if (!cards.length) return;

  cards.forEach((card) => {
    if (card.dataset.editorReady === 'true') return;
    const btn = card.querySelector('[data-add-to-cart]');
    if (!btn) return;
    const id = btn.getAttribute('data-id') || '';
    if (!id) return;

    const initialImg = card.querySelector('img')?.getAttribute('src') || 'assets/product-placeholder.svg';
    const { basePrice, discountPct } = parseProductCardPriceAndDiscount(card);
    const initialPrice = !Number.isNaN(basePrice)
      ? basePrice
      : Number(btn.getAttribute('data-price') || 0);
    const { name: initialName, composition: initialComposition, usage: initialUsage } = getInitialText(card);
    const dAttr = btn.getAttribute('data-discount');
    const initialDiscount =
      dAttr !== null && dAttr !== ''
        ? Number(dAttr) || 0
        : discountPct || parseInitialDiscount(card) || 0;

    const saved = readProductEdit(id) || {};
    const state = {
      imageSrc: saved.imageSrc || initialImg,
      name: saved.name || btn.getAttribute('data-name') || initialName,
      composition: saved.composition ?? initialComposition,
      usage: saved.usage ?? initialUsage,
      price: Number.isFinite(saved.price) ? saved.price : initialPrice,
      discount: Number.isFinite(saved.discount) ? saved.discount : initialDiscount,
    };

    // Preserve the add-to-cart button (keep event delegation working).
    const addBtn = btn;
    addBtn.textContent = addBtn.textContent || 'أضف للسلة';

    // Remove existing product view (we'll rebuild an editable card).
    card.innerHTML = '';
    card.dataset.editorReady = 'true';

    const editor = document.createElement('div');
    editor.className = 'product-editor';

    const preview = document.createElement('img');
    preview.className = 'editor-preview';
    preview.alt = 'صورة المنتج';
    preview.loading = 'lazy';
    preview.src = state.imageSrc;

    const imageLabel = document.createElement('label');
    imageLabel.textContent = 'رابط الصورة';
    const imageInput = document.createElement('input');
    imageInput.type = 'text';
    imageInput.value = state.imageSrc;
    imageInput.placeholder = 'مثال: https://… أو images/منتج.jpg';

    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'اسم المنتج';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = state.name;

    const compLabel = document.createElement('label');
    compLabel.textContent = 'التركيب';
    const compInput = document.createElement('textarea');
    compInput.value = state.composition;

    const usageLabel = document.createElement('label');
    usageLabel.textContent = 'الاستخدام';
    const usageInput = document.createElement('textarea');
    usageInput.value = state.usage;

    const priceLabel = document.createElement('label');
    priceLabel.textContent = 'السعر (قبل الخصم)';
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.step = '1';
    priceInput.min = '0';
    priceInput.value = String(state.price ?? 0);

    const discountLabel = document.createElement('label');
    discountLabel.textContent = 'الخصم (%)';
    const discountInput = document.createElement('input');
    discountInput.type = 'number';
    discountInput.step = '0.1';
    discountInput.min = '0';
    discountInput.max = '100';
    discountInput.value = String(state.discount ?? 0);

    const discountedLine = document.createElement('div');
    discountedLine.className = 'discounted-line';
    discountedLine.innerHTML = `
      <span>السعر بعد الخصم</span>
      <strong class="discounted-price">—</strong>
    `;
    const discountedPriceEl = discountedLine.querySelector('.discounted-price');

    const actions = document.createElement('div');
    actions.className = 'editor-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'حفظ التعديل';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn btn-outline';
    resetBtn.textContent = 'إعادة للبيانات';

    const previewWrap = document.createElement('div');
    previewWrap.className = 'editor-preview-wrap';

    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'btn btn-outline editor-upload-btn';
    uploadBtn.textContent = 'اختيار صورة من الكمبيوتر';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        if (!result) return;
        imageInput.value = result;
        syncToCardAndButton();
      };
      reader.readAsDataURL(file);
    });

    previewWrap.appendChild(preview);
    previewWrap.appendChild(uploadBtn);

    const editorTop = document.createElement('div');
    editorTop.className = 'editor-top';
    editorTop.appendChild(previewWrap);
    editorTop.appendChild(fileInput);

    // Append all controls
    editor.appendChild(editorTop);
    editor.appendChild(nameLabel);
    editor.appendChild(nameInput);
    editor.appendChild(compLabel);
    editor.appendChild(compInput);
    editor.appendChild(usageLabel);
    editor.appendChild(usageInput);
    editor.appendChild(priceLabel);
    editor.appendChild(priceInput);
    editor.appendChild(discountLabel);
    editor.appendChild(discountInput);
    editor.appendChild(discountedLine);
    actions.appendChild(saveBtn);
    actions.appendChild(resetBtn);
    editor.appendChild(actions);

    // Put editor in the card.
    card.appendChild(editor);
    card.appendChild(addBtn);

    // Keep data attributes in sync for cart.
    function syncToCardAndButton() {
      const imageSrc = (imageInput.value || '').trim() || 'assets/product-placeholder.svg';
      preview.src = imageSrc;

      const name = (nameInput.value || '').trim() || 'منتج';
      const composition = compInput.value || '';
      const usage = usageInput.value || '';

      const price = Number(priceInput.value || 0) || 0;
      const discount = Number(discountInput.value || 0) || 0;
      const discountedPrice = computeDiscountedPrice(price, discount);

      discountedPriceEl.textContent = fmtMoney(discountedPrice);

      // Update button attributes so cart/checkout uses the discounted price.
      addBtn.setAttribute('data-price', String(discountedPrice));
      addBtn.setAttribute('data-discount', String(discount));
      addBtn.setAttribute('data-name', name);
      addBtn.setAttribute('data-composition', composition);
      addBtn.setAttribute('data-usage', usage);
      addBtn.setAttribute('data-image', imageSrc);
    }

    function resetToSaved() {
      const s = readProductEdit(id) || {};
      const next = {
        imageSrc: s.imageSrc || state.imageSrc,
        name: s.name || state.name,
        composition: s.composition ?? state.composition,
        usage: s.usage ?? state.usage,
        price: Number.isFinite(s.price) ? s.price : state.price,
        discount: Number.isFinite(s.discount) ? s.discount : state.discount,
      };

      imageInput.value = next.imageSrc;
      nameInput.value = next.name;
      compInput.value = next.composition;
      usageInput.value = next.usage;
      priceInput.value = String(next.price ?? 0);
      discountInput.value = String(next.discount ?? 0);
      syncToCardAndButton();
    }

    // Live updates (so you can add to cart without pressing save).
    [
      imageInput,
      nameInput,
      compInput,
      usageInput,
      priceInput,
      discountInput,
    ].forEach((el) => {
      el.addEventListener('input', syncToCardAndButton);
      el.addEventListener('change', syncToCardAndButton);
    });

    saveBtn.addEventListener('click', () => {
      const payload = {
        imageSrc: (imageInput.value || '').trim() || 'assets/product-placeholder.svg',
        name: (nameInput.value || '').trim() || 'منتج',
        composition: compInput.value || '',
        usage: usageInput.value || '',
        price: Number(priceInput.value || 0) || 0,
        discount: Number(discountInput.value || 0) || 0,
        updatedAt: new Date().toISOString(),
      };
      writeProductEdit(id, payload);
      // Small UX feedback without alerts (keeps page clean).
      saveBtn.textContent = 'تم الحفظ';
      setTimeout(() => (saveBtn.textContent = 'حفظ التعديل'), 1400);
      syncToCardAndButton();
    });

    resetBtn.addEventListener('click', resetToSaved);

    // Initial sync
    syncToCardAndButton();
    addBtn.classList.add('product-add-btn');
  });
}

/** تعديل المنتجات من المتصفح: فقط مع ?admin=1 (لا ترسل هذا الرابط للعملاء) */
function maybeInitProductEditors() {
  try {
    if (new URLSearchParams(location.search).get('admin') !== '1') return;
    initProductEditors();
  } catch {
    /* ignore */
  }
}

document.addEventListener('DOMContentLoaded', () => {
  fixCompanyBrandingTypos();
  updateCartBadges();
  try {
    if (new URLSearchParams(location.search).get('admin') !== '1') {
      initProductCardFinalPrices();
    }
  } catch {
    /* ignore */
  }
  initBlog();
  maybeInitProductEditors();
});

window.addEventListener('storage', (e) => {
  if (e.key === CART_KEY) updateCartBadges();
});

/* Blog (localStorage) */
function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeBodyToHtml(text) {
  const raw = String(text || '').trim();
  if (!raw) return '<p class="muted">لا يوجد محتوى بعد.</p>';
  const paras = raw
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replaceAll('\n', '<br />')}</p>`);
  return paras.join('\n');
}

function seedDefaultPosts() {
  return [
    {
      id: 'poultry-prevention',
      title: 'أساسيات الوقاية في مزارع الدواجن',
      category: 'دواجن',
      minutes: 5,
      excerpt: 'خطوات عملية لتقليل الأمراض ورفع كفاءة الإنتاج قبل الاعتماد على العلاج.',
      body:
        'الوقاية هي خط الدفاع الأول في أي مزرعة.\n\n- الأمان الحيوي: تقليل دخول الأفراد/المركبات غير الضرورية.\n- الإدارة: كثافة مناسبة، تهوية جيدة، ونظافة مستمرة.\n- الماء والعلف: جودة ثابتة ومراقبة دورية.\n- التحصينات: الالتزام بالبرنامج وفق الطبيب البيطري.\n\nملاحظة: أي دواء يجب أن يُستخدم تحت إشراف طبيب بيطري ووفق الاشتراطات المحلية.',
      cover: 'logo.png',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'antibiotics-guidelines',
      title: 'إرشادات استخدام المضادات الحيوية بشكل مسؤول',
      category: 'ثروة حيوانية',
      minutes: 6,
      excerpt: 'كيف نضمن فعالية العلاج ونقلل مخاطر المقاومة الدوائية؟',
      body:
        'الاستخدام المسؤول للمضادات الحيوية يحافظ على فعاليتها ويقلل من مقاومة الميكروبات.\n\n1) لا تستخدم المضاد الحيوي بدون تشخيص واضح.\n2) التزم بالجرعة والمدة الموصى بها.\n3) راقب فترة السحب للمنتجات الحيوانية.\n4) تابع التحسن واطلب إعادة التقييم عند الحاجة.\n\nهدفنا: علاج فعّال دون إسراف أو مخاطر على الصحة العامة.',
      cover: 'logo.png',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'pets-supplements',
      title: 'التغذية والمكملات للحيوانات الأليفة',
      category: 'حيوانات أليفة',
      minutes: 4,
      excerpt: 'متى نلجأ للمكملات؟ وما المؤشرات التي تستدعي زيارة الطبيب البيطري؟',
      body:
        'المكملات قد تكون مفيدة في بعض الحالات مثل ضعف الشهية، مشاكل الجلد، أو فترات النمو.\n\nلكن الأهم هو النظام الغذائي المتوازن والفحص البيطري قبل الاستخدام.',
      cover: 'logo.png',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'vaccines-why-when',
      title: 'التحصينات: لماذا ومتى؟',
      category: 'عام',
      minutes: 5,
      excerpt: 'نظرة مبسطة على مفهوم التحصين ودوره في رفع المناعة الجماعية.',
      body:
        'التحصين يقلل انتشار الأمراض ويحسن الأداء الإنتاجي ويخفض تكاليف العلاج.\n\nالبرنامج يختلف حسب النوع والعمر والبيئة—استشر الطبيب البيطري لتحديد الجدول الأنسب.',
      cover: 'logo.png',
      updatedAt: new Date().toISOString(),
    },
  ];
}

function readBlogPosts() {
  try {
    const raw = localStorage.getItem(BLOG_KEY);
    if (!raw) {
      const seed = seedDefaultPosts();
      localStorage.setItem(BLOG_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBlogPosts(posts) {
  localStorage.setItem(BLOG_KEY, JSON.stringify(posts));
}

function getPostById(id) {
  const posts = readBlogPosts();
  return posts.find((p) => p.id === id) || null;
}

function upsertPost(post) {
  const posts = readBlogPosts();
  const idx = posts.findIndex((p) => p.id === post.id);
  if (idx >= 0) posts[idx] = post;
  else posts.unshift(post);
  writeBlogPosts(posts);
  return posts;
}

function deletePost(id) {
  const posts = readBlogPosts().filter((p) => p.id !== id);
  writeBlogPosts(posts);
  return posts;
}

function safeIdFromTitle(title) {
  const base = String(title || 'post')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  const suffix = String(Date.now()).slice(-5);
  return base ? `${base}-${suffix}` : `post-${suffix}`;
}

function initBlogListAndEditor() {
  const app = document.getElementById('blogApp');
  if (!app) return;

  const form = document.getElementById('blogEditor');
  const idEl = document.getElementById('postId');
  const titleEl = document.getElementById('postTitleInput');
  const catEl = document.getElementById('postCategoryInput');
  const minEl = document.getElementById('postMinutesInput');
  const excerptEl = document.getElementById('postExcerptInput');
  const bodyEl = document.getElementById('postBodyInput');
  const coverPreview = document.getElementById('postCoverPreview');
  const coverPick = document.getElementById('postCoverPick');
  const coverFile = document.getElementById('postCoverFile');
  const resetBtn = document.getElementById('postReset');
  const listEl = document.getElementById('postsList');
  const countEl = document.getElementById('postsCount');

  let coverData = 'logo.png';

  function clearEditor() {
    idEl.value = '';
    titleEl.value = '';
    catEl.value = '';
    minEl.value = '5';
    excerptEl.value = '';
    bodyEl.value = '';
    coverData = 'logo.png';
    coverPreview.src = coverData;
  }

  function renderList() {
    const posts = readBlogPosts();
    countEl.textContent = `${posts.length} مقال`;
    if (!posts.length) {
      listEl.innerHTML = '<p class="muted">لا توجد مقالات بعد. اكتب أول مقال من الأعلى.</p>';
      return;
    }
    listEl.innerHTML = posts
      .map((p) => {
        const meta = `${escapeHtml(p.category || 'عام')} • ${Number(p.minutes || 0) || 0} دقائق قراءة`;
        const excerpt = escapeHtml(p.excerpt || '');
        const title = escapeHtml(p.title || 'مقال');
        return `
          <article class="blog-item">
            <div class="blog-item-main">
              <div class="blog-item-title"><strong>${title}</strong></div>
              <div class="muted">${meta}</div>
              ${excerpt ? `<div class="muted">${excerpt}</div>` : ''}
              <div class="blog-item-actions">
                <a class="btn btn-outline" href="post.html?id=${encodeURIComponent(p.id)}">عرض</a>
                <button class="btn btn-outline" data-blog-edit="${escapeHtml(p.id)}" type="button">تعديل</button>
                <button class="btn btn-outline" data-blog-delete="${escapeHtml(p.id)}" type="button">حذف</button>
              </div>
            </div>
          </article>
        `;
      })
      .join('');
  }

  coverPick?.addEventListener('click', () => coverFile?.click());
  coverFile?.addEventListener('change', () => {
    const file = coverFile.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      coverData = String(reader.result || 'logo.png');
      coverPreview.src = coverData;
    };
    reader.readAsDataURL(file);
  });

  resetBtn?.addEventListener('click', clearEditor);

  listEl?.addEventListener('click', (e) => {
    const editId = e.target.closest?.('[data-blog-edit]')?.getAttribute('data-blog-edit');
    const delId = e.target.closest?.('[data-blog-delete]')?.getAttribute('data-blog-delete');
    if (delId) {
      deletePost(delId);
      renderList();
      if (idEl.value === delId) clearEditor();
      return;
    }
    if (editId) {
      const p = getPostById(editId);
      if (!p) return;
      idEl.value = p.id;
      titleEl.value = p.title || '';
      catEl.value = p.category || '';
      minEl.value = String(Number(p.minutes || 5) || 5);
      excerptEl.value = p.excerpt || '';
      bodyEl.value = p.body || '';
      coverData = p.cover || 'logo.png';
      coverPreview.src = coverData;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = String(titleEl.value || '').trim();
    if (!title) return;

    const id = String(idEl.value || '').trim() || safeIdFromTitle(title);
    const post = {
      id,
      title,
      category: String(catEl.value || '').trim() || 'عام',
      minutes: Number(minEl.value || 0) || 5,
      excerpt: String(excerptEl.value || '').trim(),
      body: String(bodyEl.value || '').trim(),
      cover: coverData || 'logo.png',
      updatedAt: new Date().toISOString(),
    };
    upsertPost(post);
    renderList();
    clearEditor();
  });

  renderList();
}

function initPostPage() {
  const bodyEl = document.getElementById('postBody');
  if (!bodyEl) return;

  const params = new URLSearchParams(location.search);
  const id = params.get('id') || 'poultry-prevention';
  const post = getPostById(id) || getPostById('poultry-prevention');
  if (!post) {
    document.getElementById('postTitle').textContent = 'مقال غير موجود';
    document.getElementById('postMeta').textContent = '—';
    bodyEl.innerHTML = '<p class="muted">لم يتم العثور على المقال.</p>';
    return;
  }

  document.getElementById('postTitle').textContent = post.title || 'مقال';
  const meta = `${post.category || 'عام'} • ${Number(post.minutes || 0) || 0} دقائق قراءة`;
  document.getElementById('postMeta').textContent = meta;

  const cover = post.cover ? `<img src="${escapeHtml(post.cover)}" alt="صورة المقال" class="blog-post-cover" />` : '';
  bodyEl.innerHTML = `${cover}${normalizeBodyToHtml(post.body)}`;
}

function initBlog() {
  // Only on pages that have blog elements.
  initBlogListAndEditor();
  initPostPage();
}

/* Simple analytics (localStorage pageviews) */
const PV_KEY = 'eivp_pageviews_v1';
function incPageView() {
  try {
    const raw = localStorage.getItem(PV_KEY);
    const data = raw ? JSON.parse(raw) : {};
    const path = location.pathname.split('/').pop() || 'index.html';
    data[path] = (data[path] || 0) + 1;
    data.__total = (data.__total || 0) + 1;
    data.__last = new Date().toISOString();
    localStorage.setItem(PV_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}
incPageView();

