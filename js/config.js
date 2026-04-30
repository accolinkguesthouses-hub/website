// ============================================================
// ACCOLINK — Supabase Config + API
// ============================================================
const SUPABASE_URL  = 'https://mlgehotfoslsddlpncde.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sZ2Vob3Rmb3Nsc2RkbHBuY2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzQzOTMsImV4cCI6MjA5MzExMDM5M30.tXOGGUUgcCATVVz_ehw4wifAnNVgfHI2I_5KKN_SqaQ';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
window._sb = supabase;

// ============================================================
// AUTH HELPERS
// ============================================================
const Auth = {
  async getUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },
  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },
  async signUp(email, password, fullName) {
    return supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
  },
  async signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password });
  },
  async signOut() {
    return supabase.auth.signOut();
  },
  async getProfile(userId) {
    return supabase.from('profiles').select('*').eq('id', userId).single();
  },
  async updateProfile(userId, data) {
    return supabase.from('profiles').upsert({ id: userId, ...data });
  }
};

// ============================================================
// GUESTHOUSE API
// ============================================================
const API = {
  async getGuesthouses({ city = null, featured = null, limit = 50 } = {}) {
    let q = supabase
      .from('guesthouses_with_stats')
      .select('*')
      .eq('status', 'active')
      .order('featured', { ascending: false })
      .order('avg_rating', { ascending: false });
    if (city)     q = q.eq('city', city);
    if (featured) q = q.eq('featured', true);
    if (limit)    q = q.limit(limit);
    return q;
  },

  async getGuesthouse(id) {
    return supabase.from('guesthouses_with_stats').select('*').eq('id', id).single();
  },

  async getGuestHouseImages(ghId) {
    return supabase.from('guesthouse_images').select('*').eq('guesthouse_id', ghId).order('sort_order');
  },

  async getAmenities(ghId) {
    return supabase
      .from('guesthouse_amenities')
      .select('amenities(id, name, icon, category)')
      .eq('guesthouse_id', ghId);
  },

  async getAllAmenities() {
    return supabase.from('amenities').select('*').order('category').order('name');
  },

  async getReviews(ghId) {
    return supabase
      .from('reviews')
      .select('*, profiles(full_name, avatar_url)')
      .eq('guesthouse_id', ghId)
      .order('created_at', { ascending: false });
  },

  async addReview(ghId, userId, rating, comment, reviewerName) {
    return supabase.from('reviews').upsert({
      guesthouse_id: ghId,
      user_id: userId,
      reviewer_name: reviewerName,
      rating,
      comment
    }, { onConflict: 'guesthouse_id,user_id' });
  },

  async createBooking(ghId, guestId, method, guestName) {
    return supabase.from('bookings').insert({
      guesthouse_id: ghId,
      guest_id: guestId,
      method,
      guest_name: guestName,
      status: 'pending'
    }).select().single();
  },

  async updateBookingStatus(bookingId, status) {
    return supabase.from('bookings').update({ status }).eq('id', bookingId);
  },

  async getGuestBookings(guestId) {
    return supabase
      .from('bookings')
      .select('*, guesthouses(id, name, city, neighborhood, price_per_night, phone, whatsapp)')
      .eq('guest_id', guestId)
      .order('created_at', { ascending: false });
  },

  async getHostBookings(ownerId) {
    return supabase
      .from('bookings')
      .select('*, guesthouses!inner(id, name, city, owner_id), profiles(full_name)')
      .eq('guesthouses.owner_id', ownerId)
      .order('created_at', { ascending: false });
  },

  async getOwnerGuesthouses(ownerId) {
    return supabase
      .from('guesthouses_with_stats')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });
  },

  async trackEvent(ghId, eventType, userId = null) {
    const sessionId = sessionStorage.getItem('accolink_session') || (() => {
      const id = crypto.randomUUID();
      sessionStorage.setItem('accolink_session', id);
      return id;
    })();
    return supabase.from('analytics_events').insert({
      guesthouse_id: ghId,
      event_type: eventType,
      user_id: userId,
      session_id: sessionId
    });
  },

  async createListing(data, ownerId) {
    const { amenities, images, ...rest } = data;
    const { data: gh, error } = await supabase
      .from('guesthouses')
      .insert({ ...rest, owner_id: ownerId, status: 'active' })
      .select().single();
    if (error) return { error };

    // Add amenities
    if (amenities?.length) {
      await supabase.from('guesthouse_amenities').insert(
        amenities.map(id => ({ guesthouse_id: gh.id, amenity_id: id }))
      );
    }
    return { data: gh };
  },

  async uploadImage(file, ownerId, ghId, isPrimary = false, sortOrder = 0) {
    const ext  = file.name.split('.').pop();
    const path = `${ownerId}/${ghId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('guesthouse-images').upload(path, file);
    if (upErr) return { error: upErr };
    const { data: { publicUrl } } = supabase.storage.from('guesthouse-images').getPublicUrl(path);
    return supabase.from('guesthouse_images').insert({
      guesthouse_id: ghId,
      url: publicUrl,
      is_primary: isPrimary,
      sort_order: sortOrder
    });
  }
};

// ============================================================
// UTILITY HELPERS
// ============================================================
const Utils = {
  stars(rating, max = 5) {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5;
    let html = '';
    for (let i = 1; i <= max; i++) {
      if (i <= full)       html += '<span class="star full">★</span>';
      else if (half && i === full + 1) html += '<span class="star half">★</span>';
      else                 html += '<span class="star empty">☆</span>';
    }
    return html;
  },

  timeAgo(dateStr) {
    const d    = new Date(dateStr);
    const now  = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  },

  formatPrice(p) {
    return `P${Number(p).toLocaleString()}`;
  },

  toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3500);
  },

  getParam(key) {
    return new URLSearchParams(window.location.search).get(key);
  },

  whatsappMsg(ghName, phone) {
    const msg = encodeURIComponent(`Hello! I would like to enquire about availability at your guesthouse`);
    return `https://wa.me/${phone.replace(/\D/g,'')}?text=${msg}`;
  }
};

// Auth state watcher
supabase.auth.onAuthStateChange((_event, session) => {
  window._currentUser = session?.user || null;
  document.dispatchEvent(new CustomEvent('authChange', { detail: { user: window._currentUser } }));
  updateNavForAuth(window._currentUser);
});

function updateNavForAuth(user) {
  const authBtns  = document.querySelectorAll('.nav-auth-btns');
  const userMenus = document.querySelectorAll('.nav-user-menu');
  if (!authBtns.length) return;
  authBtns.forEach(el  => el.style.display = user ? 'none'  : 'flex');
  userMenus.forEach(el => el.style.display = user ? 'flex'  : 'none');
  const nameEls = document.querySelectorAll('.user-name-display');
  nameEls.forEach(el => el.textContent = user?.user_metadata?.full_name?.split(' ')[0] || 'Account');
}
