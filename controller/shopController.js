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
        const { student_id } = req.query;
        const teacherUsername = req.user.username; 

        if (!student_id) return res.status(400).json({ status: "error", message: "student_id tidak ditemukan" });

        const { data: peers, error } = await supabase
            .from('students')
            .select('id, name, poin, is_shield_active, shield_activated_at') 
            .eq('created_by', teacherUsername)
            .neq('id', student_id);

        if (error) throw error;

        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

        const formattedPeers = await Promise.all(peers.map(async (p) => {
            let has_shield = p.is_shield_active;

            // --- LAZY RESET CHECK ---
            if (has_shield && p.shield_activated_at) {
                const shieldDateStr = new Date(p.shield_activated_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
                if (shieldDateStr !== todayStr) {
                    has_shield = false; 
                    await supabase.from('students').update({ 
                        is_shield_active: false, 
                        shield_activated_at: null 
                    }).eq('id', p.id);
                }
            }

            return {
                id: p.id,
                name: p.name,
                poin: p.poin, 
                has_shield: has_shield 
            };
        }));

        res.status(200).json({ status: "success", data: formattedPeers });

    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
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

module.exports = { buyItem, useItem, attackFriend, getPeers, getAttackNotifications, markNotificationsRead, claimWelcomeBonus, purchaseInstantEffect };