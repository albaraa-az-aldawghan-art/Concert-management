/** Runs inside the PDF browser after the Arabic font is loaded. Every row is
 * measured at its actual printed width: right column, left column, next page.
 * No fixed item-count chunks and no column balancing. */
export function paginateKitchenPdfDocument() {
  const header = document.querySelector<HTMLElement>("header.heading");
  const source = document.querySelector<HTMLElement>(".pdf-source");
  if (!header || !source) throw new Error("قالب تقرير المطبخ غير مكتمل");
  const tables = Array.from(source.querySelectorAll<HTMLTableElement>("table"));
  const expected = tables.reduce((sum, table) => sum + table.tBodies[0].rows.length, 0);
  document.body.replaceChildren();
  let columns: HTMLElement[] = [], columnIndex = 0, pages = 0, count = 0;
  const breaks: { remaining: number; required: number }[] = [];
  const layout = { makePage(pageHeader?: HTMLElement) {
    const page = document.createElement("div");page.className = "pdf-page";
    if (pageHeader) page.appendChild(pageHeader);
    const grid = document.createElement("div");grid.className = "pdf-columns";
    columns = [0, 1].map(() => { const column = document.createElement("div");column.className = "pdf-column";grid.appendChild(column);return column; });
    page.appendChild(grid);document.body.appendChild(page);columnIndex = 0;pages++;
  },
  advance() { if (columnIndex === 0) columnIndex = 1;else layout.makePage(); },
  newSection(template: HTMLTableElement, continued: boolean) {
    const section = document.createElement("section");section.className = "section";
    const table = template.cloneNode(false) as HTMLTableElement;
    table.appendChild(template.querySelector("colgroup")!.cloneNode(true));
    table.appendChild(template.tHead!.cloneNode(true));
    if (continued) table.querySelector(".category-heading th")!.append(" (تابع)");
    table.createTBody();section.appendChild(table);columns[columnIndex].appendChild(section);
    return { section, table };
  }};
  // A large selection can require several name-only pages. Do not clip names
  // or repeat them inside item columns; the last header page can start items.
  const names=Array.from(header.querySelectorAll<HTMLElement>(".concerts > span:not(.separator)"));
  const headerTemplate=header.cloneNode(true) as HTMLElement;
  const headerParts={ create() {
    const part=headerTemplate.cloneNode(true) as HTMLElement;
    const list=part.querySelector(".concerts")!;
    const label=list.querySelector("strong")!.cloneNode(true);
    list.replaceChildren(label);return part;
  }};
  let currentHeader=headerParts.create();layout.makePage(currentHeader);
  for(const name of names){
    let list=currentHeader.querySelector(".concerts")!;
    const separator=document.createElement("span");separator.className="separator";separator.textContent=" • ";
    if(list.querySelector("span"))list.appendChild(separator);
    list.appendChild(name);
    if(currentHeader.getBoundingClientRect().height>currentHeader.parentElement!.getBoundingClientRect().height-8){
      name.remove();separator.remove();currentHeader=headerParts.create();layout.makePage(currentHeader);
      list=currentHeader.querySelector(".concerts")!;list.appendChild(name);
      if(currentHeader.getBoundingClientRect().height>currentHeader.parentElement!.getBoundingClientRect().height-8)throw new Error("اسم إحدى الحفلات أطول من مساحة صفحة كاملة");
    }
  }
  if(columns[0].clientHeight<80)layout.makePage();
  for (const template of tables) {
    const rows = Array.from(template.tBodies[0].rows);
    let current = layout.newSection(template, false), consumed = 0;
    for (const row of rows) {
      current.table.tBodies[0].appendChild(row);
      const column = columns[columnIndex];
      const bottom = row.getBoundingClientRect().bottom;
      const limit = column.getBoundingClientRect().bottom - 1;
      if (bottom > limit) {
        const required = row.getBoundingClientRect().height + (consumed === 0 ? current.table.tHead!.getBoundingClientRect().height : 0);
        row.remove();
        if (!current.table.tBodies[0].rows.length) current.section.remove();
        const last = column.lastElementChild;
        const remaining = column.getBoundingClientRect().bottom - (last?.getBoundingClientRect().bottom ?? column.getBoundingClientRect().top);
        breaks.push({ remaining, required });
        layout.advance();current = layout.newSection(template, consumed > 0);current.table.tBodies[0].appendChild(row);
        while (row.getBoundingClientRect().bottom > columns[columnIndex].getBoundingClientRect().bottom - 1) {
          if(!columns[columnIndex].parentElement!.parentElement!.querySelector(".heading"))throw new Error("ملاحظات أحد الأصناف تتجاوز طول عمود كامل؛ اختصر الملاحظة قبل التصدير");
          row.remove();current.section.remove();layout.advance();current=layout.newSection(template,consumed>0);current.table.tBodies[0].appendChild(row);
        }
      }
      consumed++;count++;
    }
  }
  if (count !== expected) throw new Error("لم تكتمل جميع أصناف التقرير");
  return { pages, rows: count, breaks };
}
