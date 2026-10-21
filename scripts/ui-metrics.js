// Mede elementos da interface para comparar o Tasklight com o ClickUp na mesma resolução.
// Cole no console do DevTools (ou avalie pelo protocolo) e chame:
//   uiMetrics({ topbar: '[data-ui="topbar"]', rail: '[data-ui="rail"]' })
// Os seletores de cada app estão em scripts/ui-reference.json.
globalThis.uiMetrics = (selectors) => {
  const round = (value) => Math.round(value * 10) / 10;
  const result = {};
  for (const [name, selector] of Object.entries(selectors)) {
    const element = document.querySelector(selector);
    if (!element) {
      result[name] = null;
      continue;
    }
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    result[name] = {
      x: round(box.x),
      y: round(box.y),
      width: round(box.width),
      height: round(box.height),
      backgroundColor: style.backgroundColor,
      color: style.color,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      borderRadius: style.borderRadius,
    };
  }
  return result;
};
