export interface ImageWrapperOptions {
  align?: 'left' | 'center' | 'right';
  width?: number;
  padding?: number;
}

export function buildImageWrapperHtml(url: string, alt: string, options?: ImageWrapperOptions): string {
  const align = options?.align ?? 'center';
  const width = Math.max(20, Math.min(100, options?.width ?? 70));
  const padding = Math.max(0, Math.min(32, options?.padding ?? 8));
  const safeUrl = url.replace(/"/g, '%22');
  const safeAlt = alt.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div class="image-wrapper" data-align="${align}" data-width="${width}" data-padding="${padding}"><img src="${safeUrl}" alt="${safeAlt}" loading="lazy" draggable="true" /></div>`;
}

export function ensureImageWrappers(container: HTMLElement): void {
  container.querySelectorAll('img').forEach((img) => {
    if (img.closest('.image-wrapper')) {
      img.setAttribute('loading', 'lazy');
      img.setAttribute('draggable', 'true');
      return;
    }

    const wrapper = window.document.createElement('div');
    wrapper.className = 'image-wrapper';
    wrapper.dataset.align = 'center';
    wrapper.dataset.width = '70';
    wrapper.dataset.padding = '8';
    img.parentNode?.insertBefore(wrapper, img);
    wrapper.appendChild(img);
    img.setAttribute('loading', 'lazy');
    img.setAttribute('draggable', 'true');
  });
}

export function applyImageWrapperLayout(img: HTMLImageElement, options: Required<ImageWrapperOptions>): void {
  const wrapper = img.closest('.image-wrapper') as HTMLDivElement | null;
  if (!wrapper) return;

  wrapper.dataset.align = options.align;
  wrapper.dataset.width = String(options.width);
  wrapper.dataset.padding = String(options.padding);
  wrapper.style.width = `${options.width}%`;
  wrapper.style.marginTop = `${options.padding}px`;
  wrapper.style.marginBottom = `${options.padding}px`;

  if (options.align === 'left') {
    wrapper.style.marginLeft = '0';
    wrapper.style.marginRight = 'auto';
  } else if (options.align === 'right') {
    wrapper.style.marginLeft = 'auto';
    wrapper.style.marginRight = '0';
  } else {
    wrapper.style.marginLeft = 'auto';
    wrapper.style.marginRight = 'auto';
  }

  img.style.display = 'block';
  img.style.width = '100%';
  img.style.maxWidth = '100%';
  img.style.height = 'auto';
  img.style.borderRadius = '8px';
}
