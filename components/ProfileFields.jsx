"use client";

// 學員資料 8 欄表單欄位（真實姓名/手機/鋼琴程度 必填＋goal/source/equipment/age_group/gender 選填）。
// 純受控欄位元件：吃 prof/setProf 與樣式（input/label），供帳號頁「我的學員資料」與首次引導共用。
export default function ProfileFields({ prof, setProf, styles }) {
  const { input, label } = styles;
  return (
    <>
      <div><label style={label}>真實姓名 *</label>
        <input style={input} value={prof.real_name} onChange={e => setProf(p => ({ ...p, real_name: e.target.value }))} /></div>
      <div><label style={label}>手機 *</label>
        <input style={input} value={prof.phone} onChange={e => setProf(p => ({ ...p, phone: e.target.value }))} placeholder="09xxxxxxxx" /></div>
      <div><label style={label}>鋼琴程度 *</label>
        <select style={input} value={prof.level} onChange={e => setProf(p => ({ ...p, level: e.target.value }))}>
          <option value="">請選擇</option><option value="none">完全沒碰過</option>
          <option value="little">摸過一點</option><option value="some">有基礎</option></select></div>
      <div><label style={label}>學習目標（選填）</label>
        <input style={input} value={prof.goal} onChange={e => setProf(p => ({ ...p, goal: e.target.value }))} /></div>
      <div><label style={label}>怎麼認識 InRecord（選填）</label>
        <select style={input} value={prof.source} onChange={e => setProf(p => ({ ...p, source: e.target.value }))}>
          <option value="">請選擇</option><option value="ig">Instagram</option><option value="friend">朋友介紹</option>
          <option value="concert">演奏會</option><option value="search">網路搜尋</option><option value="other">其他</option></select></div>
      <div><label style={label}>練習器材（選填）</label>
        <select style={input} value={prof.equipment} onChange={e => setProf(p => ({ ...p, equipment: e.target.value }))}>
          <option value="">請選擇</option><option value="acoustic">鋼琴</option><option value="digital">電鋼琴</option><option value="none">目前沒有</option></select></div>
      <div><label style={label}>年齡層（選填）</label>
        <select style={input} value={prof.age_group} onChange={e => setProf(p => ({ ...p, age_group: e.target.value }))}>
          <option value="">請選擇</option><option value="under18">未滿 18</option><option value="18_29">18–29</option>
          <option value="30_44">30–44</option><option value="45_59">45–59</option><option value="60plus">60 以上</option></select></div>
      <div><label style={label}>性別（選填）</label>
        <select style={input} value={prof.gender} onChange={e => setProf(p => ({ ...p, gender: e.target.value }))}>
          <option value="">請選擇</option><option value="male">男</option><option value="female">女</option>
          <option value="other">其他</option><option value="prefer_not">不願透露</option></select></div>
    </>
  );
}
