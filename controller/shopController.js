const supabase = require('../config/supabaseClient');

const ITEM_PRICES = {
    item_double_score: 50,
    item_serang: 100,
    item_perisai: 75,
    item_extra_life: 150
};

// 1. BELI ITEM
const buyItem = async (req, res) => {
    try {
        const { student_id, item_type } = req.body;
        if (!ITEM_PRICES[item_type]) return res.status(400).json({ status: "error", message: "Item tidak valid." });

        const finalPrice = ITEM_PRICES[item_type];
        const { data: student, error: fetchError } = await supabase
            .from('students')
            .select('poin, item_double_score, item_serang, item_perisai, item_extra_life')
            .eq('id', student_id)
            .single();

        if (fetchError || !student) throw fetchError || new Error("Siswa tidak ditemukan");
        if (Number(student.poin) < finalPrice) {
            return res.status(400).json({ status: "error", message: `Poin tidak cukup. Butuh ${finalPrice}, poinmu ${student.poin}` });
        }

        const updatedData = {
            poin: Number(student.poin) - finalPrice,
            [item_type]: (student[item_type] || 0) + 1
        };

        const { error: updateError } = await supabase.from('students').update(updatedData).eq('id', student_id);
        if (updateError) throw updateError;

        // [UPDATE KUNCI]: Masukkan nama item ke dalam kolom JSONB metadata
        await supabase.from('gamification_logs').insert([{
            actor_id: student_id,
            action_type: 'beli_item',
            point_change: finalPrice,
            is_read: true, // Otomatis terbaca karena dilakukan sendiri
            metadata: { item_type: item_type } // <--- Simpan identitas item di sini
        }]);

        res.status(200).json({ status: "success", message: "Berhasil membeli item!", data: updatedData });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 2. GUNAKAN ITEM (DARI INVENTORY KE STATUS AKTIF)
const useItem = async (req, res) => {
    try {
        const { student_id, item_type } = req.body;
        
        const { data: student, error: fetchError } = await supabase
            .from('students')
            .select(item_type)
            .eq('id', student_id)
            .single();
            
        if (fetchError || !student) throw fetchError;
        if (student[item_type] <= 0) return res.status(400).json({ status: "error", message: "Item tidak ada di inventory!" });

        // Kurangi 1 dari tas
        const updatedData = { [item_type]: student[item_type] - 1 };

        // Nyalakan perlindungan & catat waktu diaktifkannya untuk Midnight Reset
        if (item_type === 'item_perisai') {
            updatedData.is_shield_active = true;
            updatedData.shield_activated_at = new Date().toISOString(); 
        }

        const { error: updateError } = await supabase.from('students').update(updatedData).eq('id', student_id);
        if (updateError) throw updateError;
        
        res.status(200).json({ status: "success", message: "Item berhasil diaktifkan!" });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 3. GUNAKAN ITEM SERANG
const attackFriend = async (req, res) => {
    try {
        const { actor_id, target_id } = req.body;

        const { data: users, error: fetchError } = await supabase
            .from('students')
            .select('id, name, poin, item_serang, is_shield_active, shield_activated_at') 
            .in('id', [actor_id, target_id]);

        if (fetchError || users.length !== 2) return res.status(400).json({ status: "error", message: "Data pemain tidak valid." });

        const actor = users.find(u => u.id === actor_id);
        const target = users.find(u => u.id === target_id);

        if (actor.item_serang <= 0) return res.status(400).json({ status: "error", message: "Kamu tidak memiliki item Serangan!" });

        let targetPoinLompat = 50; 
        let message = "";
        let actionType = "";
        let newActorPoin = actor.poin; 

        // --- VALIDASI "MIDNIGHT RESET" ---
        let isTargetShielded = target.is_shield_active;
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

        if (isTargetShielded && target.shield_activated_at) {
            const targetDateStr = new Date(target.shield_activated_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
            if (targetDateStr !== todayStr) {
                isTargetShielded = false; 
                await supabase.from('students').update({ is_shield_active: false, shield_activated_at: null }).eq('id', target_id);
            }
        }

        // Skenario A: Target punya perisai aktif
        if (isTargetShielded) {
            await supabase.from('students').update({ item_serang: actor.item_serang - 1 }).eq('id', actor_id);
            message = `Serangan gagal! ${target.name} sedang dilindungi Perisai Sihir.`;
            actionType = 'serang_ditahan';
            targetPoinLompat = 0;
        } 
        // Skenario B: Target rentan (Berhasil dicuri)
        else {
            const poinHilang = Math.min(target.poin, targetPoinLompat); 
            newActorPoin = actor.poin + poinHilang;
            
            await supabase.from('students').update({ item_serang: actor.item_serang - 1, poin: newActorPoin }).eq('id', actor_id);
            await supabase.from('students').update({ poin: target.poin - poinHilang }).eq('id', target_id);

            message = `Serangan berhasil! Kamu mencuri ${poinHilang} poin dari ${target.name}.`;
            actionType = 'serang_berhasil';
        }

        await supabase.from('gamification_logs').insert([{ 
            actor_id, 
            target_id, 
            action_type: actionType, 
            point_change: targetPoinLompat 
        }]);
        
        res.status(200).json({ status: "success", message, data: { new_poin: newActorPoin } });

    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 4. DAFTAR TEMAN UNTUK DISERANG
const getPeers = async (req, res) => {
    try {
        // Ambil query mode, subject, dan week yang dikirim dari Frontend
        const { student_id, mode, subject, week } = req.query;

        // 1. Ambil semua murid selain diri sendiri
        let { data: peers, error } = await supabase
            .from('students')
            .select('id, name, poin, is_shield_active, item_perisai')
            .neq('id', student_id);
        
        if (error) throw error;

        // 2. Format status perisai
        peers = peers.map(p => ({
            ...p,
            has_shield: p.is_shield_active || p.item_perisai > 0
        }));

        // 3. [FIX] Filter JIKA mode = 'khusus' (Hanya untuk PR ini yang belum selesai)
        if (mode === 'khusus' && subject && week) {
            // Cek siapa aja yang udah beres ngerjain PR subject & week ini
            const { data: finished } = await supabase
                .from('onboarding_results')
                .select('student_id')
                .eq('subject', subject)
                .eq('week', week);
            
            const finishedIds = finished ? finished.map(f => f.student_id) : [];
            
            // Singkirkan mereka yang ID-nya ada di finishedIds
            peers = peers.filter(p => !finishedIds.includes(p.id));
        }

        res.status(200).json({ status: "success", data: peers });
    } catch (e) {
        res.status(500).json({ status: "error", message: e.message });
    }
};

// 5. CEK NOTIFIKASI SERANGAN
const getAttackNotifications = async (req, res) => {
    try {
        const { student_id } = req.query;
        const { data: logs, error } = await supabase.from('gamification_logs').select('*').eq('target_id', student_id).eq('action_type', 'serang_berhasil').eq('is_read', false);

        if (error) throw error;
        if (!logs || logs.length === 0) return res.status(200).json({ status: "success", data: [] });

        const actorIds = [...new Set(logs.map(l => l.actor_id))];
        const { data: actors } = await supabase.from('students').select('id, name').in('id', actorIds);

        const notifications = logs.map(log => {
            const actor = actors.find(a => a.id === log.actor_id);
            return { id: log.id, attacker_name: actor ? actor.name : 'Seseorang', points_lost: log.point_change };
        });

        res.status(200).json({ status: "success", data: notifications });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const markNotificationsRead = async (req, res) => {
    try {
        const { log_ids } = req.body;
        const { error } = await supabase.from('gamification_logs').update({ is_read: true }).in('id', log_ids);
        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 6. KLAIM BONUS WELCOME
const claimWelcomeBonus = async (req, res) => {
    try {
        const { student_id } = req.body;
        const { data: student, error: fetchErr } = await supabase.from('students').select('poin, has_claimed_bonus').eq('id', student_id).single();

        if (fetchErr) throw fetchErr;
        if (student.has_claimed_bonus) return res.status(400).json({ status: "error", message: "Bonus ini sudah pernah kamu ambil!" });

        const newPoin = (student.poin || 0) + 50;
        const { error: updateErr } = await supabase.from('students').update({ poin: newPoin, has_claimed_bonus: true }).eq('id', student_id);

        if (updateErr) throw updateErr;
        await supabase.from('gamification_logs').insert([{
            actor_id: student_id,
            action_type: 'bonus_welcome',
            point_change: 50,
            is_read: true
        }]);
        res.status(200).json({ status: "success", data: { poin: newPoin } });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const purchaseInstantEffect = async (req, res) => {
    try {
        const { student_id, effect_type, cost, target_id } = req.body;
        
        // 1. Cek Saldo
        const { data: student, error: fetchError } = await supabase
            .from('students')
            .select('poin')
            .eq('id', student_id)
            .single();

        if (fetchError || !student) throw fetchError;
        if (student.poin < cost) return res.status(400).json({ status: "error", message: "Koin tidak cukup!" });

        // 2. Potong Saldo
        const newPoin = student.poin - cost;
        const { error: updateError } = await supabase.from('students').update({ poin: newPoin }).eq('id', student_id);
        if (updateError) throw updateError;

        // 3. Catat di Log jika ini adalah Serangan Bully (biar notifnya kebaca di hp korban)
        if (effect_type === 'bully' && target_id) {
            await supabase.from('gamification_logs').insert([{ 
                actor_id: student_id, 
                target_id: target_id, 
                action_type: 'bully', 
                point_change: 0, // Bully nggak nyolong poin, cuma nyusahin doang
                is_read: false 
            }]);
        }

        res.status(200).json({ status: "success", data: { new_poin: newPoin } });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// FITUR JUAL ITEM
const sellItem = async (req, res) => {
    try {
        const { student_id, item_type } = req.body;
        const { data: student } = await supabase.from('students').select('*').eq('id', student_id).single();
        
        if (student[item_type] <= 0) return res.status(400).json({ status: "error", message: "Item tidak ditemukan." });

        const sellPrice = Math.floor(ITEM_PRICES[item_type] / 2);
        const newPoin = student.poin + sellPrice;

        await supabase.from('students').update({ poin: newPoin, [item_type]: student[item_type] - 1 }).eq('id', student_id);
        
        res.status(200).json({ status: "success", message: `Berhasil dijual seharga ${sellPrice} koin`, data: { new_poin: newPoin } });
    } catch (e) { res.status(500).json({ status: "error", message: e.message }); }
};

// FITUR HADIAHKAN ITEM
const giftItem = async (req, res) => {
    try {
        const { actor_id, target_id, item_type } = req.body;
        
        // Pastikan harga item disesuaikan dengan konstanta kalian
        const ITEM_PRICES = {
            item_double_score: 50, item_serang: 100, item_perisai: 75,
            item_extra_life: 150, item_tambah_waktu: 100, item_double_coin: 200,
            item_triple_coin: 250, item_bullying: 50, item_diskon: 50
        };
        const price = ITEM_PRICES[item_type] || 0;

        if (price === 0) throw new Error("Item tidak valid.");

        // 1. Ambil data Pengirim
        const { data: actor, error: actorErr } = await supabase
            .from('students')
            .select('poin, name')
            .eq('id', actor_id)
            .single();

        if (actorErr || !actor) throw new Error("Data pengirim tidak ditemukan.");
        if (actor.poin < price) return res.status(400).json({ status: "error", message: "Poin tidak cukup!" });

        // 2. Ambil data Penerima
        const { data: target, error: targetErr } = await supabase
            .from('students')
            .select(`id, ${item_type}`)
            .eq('id', target_id)
            .single();

        // [FIX ERROR] Tangkap error jika kolom gak ada di DB atau murid gak ketemu
        if (targetErr) {
            console.error("Target Query Error:", targetErr.message);
            throw new Error(`Gagal akses data penerima. Pastikan kolom ${item_type} sudah ada di tabel students.`);
        }
        if (!target) throw new Error("Penerima tidak ditemukan.");

        // 3. Eksekusi Update Saldo & Item
        const newActorPoin = actor.poin - price;
        const newTargetItemCount = (target[item_type] || 0) + 1;

        await supabase.from('students').update({ poin: newActorPoin }).eq('id', actor_id);
        await supabase.from('students').update({ [item_type]: newTargetItemCount }).eq('id', target_id);

        // 4. Catat di Log biar muncul modal pas penerima buka ujian
        const niceName = item_type.replace('item_', '').replace(/_/g, ' ').toUpperCase();
        
        // [IMPROVE] Masukkan attacker_name agar popup tau siapa yg ngirim
        await supabase.from('gamification_logs').insert([{ 
            actor_id, 
            target_id, 
            action_type: 'gift', 
            point_change: 0, 
            is_read: false, 
            attacker_name: actor.name, // <--- Ini penting biar nama pengirim muncul di UI penerima
            metadata: { item_type: item_type, item_name: niceName }
        }]);

        res.status(200).json({ status: "success", message: "Hadiah berhasil dikirim!", data: { new_poin: newActorPoin } });
    } catch (e) { 
        console.error("Error Gift:", e);
        res.status(500).json({ status: "error", message: e.message }); 
    }
};

module.exports = { buyItem, useItem, attackFriend, getPeers, getAttackNotifications, markNotificationsRead, claimWelcomeBonus, purchaseInstantEffect, sellItem, giftItem };