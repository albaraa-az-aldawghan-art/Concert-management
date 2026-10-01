export function renamedRawCategories(categories: string[], oldName: string, newName: string): string[] {
  const oldValue = oldName.trim();
  const newValue = newName.trim();
  if (!oldValue || !categories.includes(oldValue)) throw new Error("القسم غير موجود");
  if (!newValue) throw new Error("أدخل اسم القسم الجديد");
  if (newValue !== oldValue && categories.includes(newValue)) throw new Error("اسم القسم موجود مسبقًا");
  return categories.map((category) => category === oldValue ? newValue : category);
}

export function deletedRawCategories(categories: string[], name: string): string[] {
  const value = name.trim();
  if (!value || !categories.includes(value)) throw new Error("القسم غير موجود");
  return categories.filter((category) => category !== value);
}
