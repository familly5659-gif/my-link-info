export const categories = {
  '주방': ['수세미', '주방세제', '조리도구', '식기·컵', '주방수납', '기타'],
  '청소': ['청소용품', '세탁용품', '욕실청소', '청소기·기기', '기타'],
  '생활·수납': ['수납·정리', '생활잡화', '인테리어', '기타'],
  '디지털': ['충전·배터리', '음향기기', '모바일·PC', '기타'],
  '패션·뷰티': ['패션잡화', '의류', '뷰티', '기타'],
  '라이프': ['조명', '식품', '취미·여가', '기타'],
};

export function normalizeCategory(category, subcategory = '기타') {
  const main = category === '살림·주방' ? '주방' : category;
  if (!Object.hasOwn(categories, main) || !categories[main].includes(subcategory)) return null;
  return { category: main, subcategory };
}
