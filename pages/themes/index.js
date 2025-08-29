import Link from 'next/link';

const themes = [
  {
    slug: 'damashqi',
    title: 'الثيم الدمشقي',
    description: 'ثيم عربي بتصميم دمشقي',
    image: '/hero.png'
  },
  {
    slug: 'modern',
    title: 'الثيم العصري',
    description: 'تصميم حديث وأنيق',
    image: '/hero.png'
  }
];

export default function ThemesPage() {
  return (
    <main className="container">
      <h1>Available Themes</h1>
      <ul>
        {themes.map(theme => (
          <li key={theme.slug} style={{ marginBottom: '1rem' }}>
            <Link href={`/themes/${theme.slug}`}><strong>{theme.title}</strong></Link>
            <p>{theme.description}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
