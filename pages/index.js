import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';

export default function Home() {
  return (
    <>
      <Head>
        <title>Anaqati Marketing Platform</title>
        <meta name="description" content="Modern affiliate marketing platform for store owners" />
      </Head>
      <main className="container">
        <header className="header">
          <h1>Anaqati</h1>
          <nav>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/products">Products</Link>
            <Link href="/orders">Orders</Link>
            <Link href="/commissions">Commissions</Link>
          </nav>
        </header>
        <section className="hero">
          <h2>منصة أناقتي للتسويق</h2>
          <p>قم بإنشاء متجرك، اختر منتجاتك، واستمتع بعمولات مجزية.</p>
          <Link href="/dashboard" className="cta">ابدأ الآن</Link>
          <div className="hero-img">
            <Image src="/hero.png" alt="Hero" width={800} height={500} />
          </div>
        </section>
        <style jsx>{`
          .container {
            padding: 0 1rem;
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1rem 0;
          }
          nav a {
            margin-left: 1rem;
            text-decoration: none;
            color: #1f2436;
          }
          .hero {
            text-align: center;
            padding: 4rem 0;
          }
          .hero-img {
            margin-top: 2rem;
          }
          .cta {
            display: inline-block;
            margin-top: 1rem;
            padding: 0.75rem 1.5rem;
            background-color: #f5b02b;
            color: white;
            border-radius: 4px;
            text-decoration: none;
          }
        `}</style>
      </main>
    </>
  );
}
