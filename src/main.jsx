import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Link } from 'react-router-dom';
import './styles.css';

const API = 'http://localhost:5001/api';

function token() {
  return localStorage.getItem('token');
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/share/:token" element={<SharedAlbum />} />
      </Routes>
    </BrowserRouter>
  );
}

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = React.useState('login');
  const [form, setForm] = React.useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(API + (mode === 'login' ? '/auth/login' : '/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || 'Request failed');
        return;
      }

      if (mode === 'login') {
        if (data.token) {
          localStorage.setItem('token', data.token);
          nav('/dashboard');
        } else {
          alert('No token returned');
        }
      } else {
        alert('Account created. Now log in.');
        setMode('login');
        setForm({ name: '', email: form.email, password: '' });
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authPage">
      <form className="authCard" onSubmit={submit}>
        <div className="brand">
          <div className="brandIcon">◌</div>
          <div>
            <h1>Photo Vault</h1>
            <p>Private albums with fast sharing</p>
          </div>
        </div>

        {mode === 'register' && (
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        )}

        <input
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />

        <input
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'}
        </button>

        <button
          type="button"
          className="ghostButton"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'Need account? Register' : 'I already have account'}
        </button>
      </form>
    </div>
  );
}

function Dashboard() {
  const nav = useNavigate();
  const [me, setMe] = React.useState(null);
  const [title, setTitle] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [editing, setEditing] = React.useState(null);
  const [editForm, setEditForm] = React.useState({ title: '' });
  const [shareLink, setShareLink] = React.useState('');
  const [preview, setPreview] = React.useState('');
  const [uploadingId, setUploadingId] = React.useState(null);
  const [modal, setModal] = React.useState(null);
  const [dropActive, setDropActive] = React.useState(null);

  const load = async () => {
    const t = token();
    if (!t) return nav('/');

    try {
      const res = await fetch(API + '/me', {
        headers: { Authorization: 'Bearer ' + t }
      });

      if (!res.ok) {
        localStorage.removeItem('token');
        nav('/');
        return;
      }

      const data = await res.json();
      setMe(data);
    } catch (err) {
      console.error(err);
      alert('Failed to load dashboard');
    }
  };

  React.useEffect(() => {
    load();
  }, []);

  const createAlbum = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      const res = await fetch(API + '/albums', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Failed to create album');
        return;
      }

      setTitle('');
      load();
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
  };

  const startEdit = (album) => {
    setEditing(album.id);
    setEditForm({ title: album.title || '' });
  };

  const saveEdit = async (albumId) => {
    await fetch(API + `/albums/${albumId}`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer ' + token(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(editForm)
    });
    setEditing(null);
    load();
  };

  const uploadPhoto = async (albumId, file, inputEl) => {
    if (!file || uploadingId === albumId) return;
    setUploadingId(albumId);

    try {
      const fd = new FormData();
      fd.append('photo', file);

      const res = await fetch(API + `/albums/${albumId}/photos`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token() },
        body: fd
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || 'Upload failed');
        return;
      }

      if (inputEl) inputEl.value = '';
      setPreview('');
      load();
    } catch (err) {
      console.error(err);
      alert('Upload network error');
    } finally {
      setUploadingId(null);
      setDropActive(null);
    }
  };

  const onDropFiles = (albumId, e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
      uploadPhoto(albumId, file);
    }
  };

  const makeShare = async (albumId) => {
    const res = await fetch(API + `/albums/${albumId}/share`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token() }
    });

    const data = await res.json();
    setShareLink(data.link);
  };

  const deleteAlbum = async (albumId) => {
    await fetch(API + `/albums/${albumId}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token() }
    });
    load();
  };

  const deletePhoto = async (photoId) => {
    await fetch(API + `/photos/${photoId}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token() }
    });
    load();
  };

  const logout = () => {
    localStorage.removeItem('token');
    nav('/');
  };

  if (!me) return <div className="loadingPage">Loading...</div>;

  const filteredAlbums =
    me.albums?.filter((album) =>
      album.title.toLowerCase().includes(search.toLowerCase())
    ) || [];

  return (
    <div className="dashboard">
      <header className="topHeader">
        <div>
          <h2>Welcome, {me.name}</h2>
          <p>Organize and share your photos in private albums</p>
        </div>
        <button type="button" onClick={logout}>Logout</button>
      </header>

      <section className="card" style={{ marginBottom: 18 }}>
        <input
          placeholder="Search albums by title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </section>

      <form className="createBar card" onSubmit={createAlbum}>
        <input
          placeholder="New album title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit">Create album</button>
      </form>

      {shareLink && (
        <section className="shareNotice card">
          <span>Share link:</span>
          <a href={shareLink} target="_blank" rel="noreferrer">{shareLink}</a>
        </section>
      )}

      {preview && (
        <section className="card previewCard">
          <div className="sectionTitle">
            <h3>Preview</h3>
            <span>Before upload</span>
          </div>
          <img src={preview} className="previewImage" alt="preview" />
        </section>
      )}

      <div className="albumsGrid">
        {filteredAlbums.length ? filteredAlbums.map((album) => (
          <article className="card albumCard" key={album.id}>
            <div className="albumHead">
              <div>
                {editing === album.id ? (
                  <div className="editAlbum">
                    <input
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    />
                    <button type="button" onClick={() => saveEdit(album.id)}>Save</button>
                    <button type="button" className="ghostButton" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <h3>{album.title}</h3>
                    <p>{album.photos?.length || 0} photos</p>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="ghostButton" onClick={() => startEdit(album)}>
                  Edit
                </button>
                <button type="button" className="danger" onClick={() => deleteAlbum(album.id)}>
                  Delete
                </button>
              </div>
            </div>

            <div
              className={`dropZone ${dropActive === album.id ? 'active' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDropActive(album.id);
              }}
              onDragLeave={() => setDropActive(null)}
              onDrop={(e) => onDropFiles(album.id, e)}
            >
              <p>Drag & drop photo here</p>
              <span>or choose file below</span>
            </div>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) setPreview(URL.createObjectURL(file));
                uploadPhoto(album.id, file, e.target);
              }}
            />

            <div className="albumActions">
              <button
                type="button"
                onClick={() => makeShare(album.id)}
                disabled={uploadingId === album.id}
              >
                {uploadingId === album.id ? 'Uploading...' : 'Get share link'}
              </button>

              <button
                type="button"
                className="ghostButton"
                onClick={() =>
                  navigator.clipboard.writeText(`${window.location.origin}/share/${album.shareToken}`)
                }
              >
                Copy link
              </button>
            </div>

            <div className="photosGrid">
              {album.photos?.length ? (
                album.photos.map((photo) => (
                  <button
                    key={photo.id}
                    className="photoItem"
                    onClick={() => setModal(photo.url)}
                    type="button"
                    title="Open photo"
                  >
                    <img src={photo.url} className="albumImg" alt="" />
                    <span className="photoDeleteWrap">
                      <span className="photoUrl">Photo</span>
                      <span
                        className="tinyDanger"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePhoto(photo.id);
                        }}
                      >
                        Delete
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="emptyState">No photos yet</div>
              )}
            </div>
          </article>
        )) : (
          <div className="emptyState">No albums found</div>
        )}
      </div>

      {modal && (
        <div className="modalBackdrop" onClick={() => setModal(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <button className="modalClose" onClick={() => setModal(null)}>×</button>
            <img src={modal} className="modalImage" alt="" />
          </div>
        </div>
      )}
    </div>
  );
}

function SharedAlbum() {
  const { token: shareToken } = useParams();
  const [album, setAlbum] = React.useState(null);
  const [modal, setModal] = React.useState(null);

  React.useEffect(() => {
    fetch(API + '/share/' + shareToken)
      .then((r) => r.json())
      .then(setAlbum);
  }, [shareToken]);

  if (!album) return <div className="loadingPage">Loading...</div>;

  return (
    <div className="dashboard">
      <header className="topHeader">
        <div>
          <h2>{album.title}</h2>
          <p>Owner: {album.user.name}</p>
        </div>
        <Link to="/" className="ghostLink">Back</Link>
      </header>

      <div className="sharedGrid">
        {album.photos.map((photo) => (
          <button key={photo.id} className="sharedPhotoItem" onClick={() => setModal(photo.url)} type="button">
            <img src={photo.url} className="sharedImg" alt="" />
          </button>
        ))}
      </div>

      {modal && (
        <div className="modalBackdrop" onClick={() => setModal(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <button className="modalClose" onClick={() => setModal(null)}>×</button>
            <img src={modal} className="modalImage" alt="" />
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);