export default function UserAccessLoading() {
  return (
    <main className="app-main loading-page" id="main-content" aria-busy="true" aria-label="Memuat Pengguna dan Akses">
      <span className="sr-only" role="status">Memuat data pengguna dan akses…</span>
      <header className="page-header" aria-hidden="true">
        <div>
          <div className="skeleton" style={{ width: "10rem", height: "1rem", marginBottom: "1rem" }} />
          <div className="page-title-row">
            <div className="skeleton" style={{ width: "3rem", height: "3rem" }} />
            <div>
              <div className="skeleton" style={{ width: "17rem", maxWidth: "70vw", height: "2.3rem" }} />
              <div className="skeleton" style={{ width: "24rem", maxWidth: "75vw", height: "1rem", marginTop: "0.7rem" }} />
            </div>
          </div>
        </div>
      </header>
      <div className="skeleton" aria-hidden="true" style={{ width: "100%", height: "4.5rem", marginBottom: "1rem" }} />
      <div className="access-workspace" aria-hidden="true">
        <section className="card" style={{ overflow: "hidden" }}>
          <div className="skeleton" style={{ height: "4.8rem", borderRadius: 0 }} />
          {[1, 2, 3, 4, 5].map((item) => <div className="skeleton" key={item} style={{ height: "7rem", margin: "0.8rem" }} />)}
        </section>
        <section className="detail-stack">
          <div className="skeleton card" style={{ height: "10.5rem" }} />
          {[1, 2, 3].map((item) => <div className="skeleton card" key={item} style={{ height: "14rem" }} />)}
        </section>
      </div>
    </main>
  );
}
