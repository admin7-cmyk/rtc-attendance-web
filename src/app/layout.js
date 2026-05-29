import './globals.css';

export const metadata = {
  title: 'ระบบเช็กชื่อเข้าแถว',
  description:
    'ระบบเช็กชื่อเข้าแถว แผนกวิชาช่างไฟฟ้ากำลัง วิทยาลัยเทคนิคราชบุรี',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}