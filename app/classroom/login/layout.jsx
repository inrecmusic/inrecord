// 登入頁自己的 metadata：page.jsx 是 client component 不能 export metadata，所以放這層 layout。
// noindex：登入頁不該被搜尋引擎收錄；title 讓分頁／歷史紀錄看得出是登入頁，不再沿用首頁的標題與描述。
export const metadata = { title: "學員登入｜InRecord", robots: { index: false, follow: false } };
export default function LoginLayout({ children }) { return children; }
