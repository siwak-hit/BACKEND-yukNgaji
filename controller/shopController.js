const supabase = require('../config/supabaseClient');

// Daftar harga item (bisa diubah sesuai keseimbangan game)
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

        if (!ITEM_PRICES[item_type]) {
            return res.status(400).json({ status: "error", message: "Item tidak valid." });
        }

        const price = ITEM_PRICES[item_type];

        // Cek saldo poin murid
        const { data: student, error: fetchError } = await supabase
            .from('students')
            .select('poin, item_double_score, item_serang, item_perisai, item_extra_life')
            .eq('id', student_id)
            .single();

        if (fetchError || !student) throw fetchError || new Error("Siswa tidak ditemukan");

        if (student.poin < price) {
            return res.status(400).json({ status: "error", message: "Poin tidak cukup untuk membeli item ini." });
        }

        // Kurangi poin dan tambah item
        const updatedData = {
            poin: student.poin - price,
            [item_type]: student[item_type] + 1
        };

        const { error: updateError } = await supabase
            .from('students')
            .update(updatedData)
            .eq('id', student_id);

        if (updateError) throw updateError;

        res.status(200).json({ 
            status: "success", 
            message: "Berhasil membeli item!", 
            data: updatedData 
        });

    } catch (error) {
        console.error("Buy Item Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 2. GUNAKAN ITEM SERANG
const attackFriend = async (req, res) => {
    try {
        const { actor_id, target_id } = req.body;

        // Ambil data penyerang dan target
        const { data: users, error: fetchError } = await supabase
            .from('students')
            .select('id, name, poin, item_serang, item_perisai')
            .in('id', [actor_id, target_id]);

        if (fetchError || users.length !== 2) {
            return res.status(400).json({ status: "error", message: "Data pemain tidak valid." });
        }

        const actor = users.find(u => u.id === actor_id);
        const target = users.find(u => u.id === target_id);

        if (actor.item_serang <= 0) {
            return res.status(400).json({ status: "error", message: "Kamu tidak memiliki item Serangan!" });
        }

        let targetPoinLompat = 50; // Jumlah poin yang dicuri
        let message = "";
        let actionType = "";

        // Skenario A: Target punya perisai
        if (target.item_perisai > 0) {
            await supabase.from('students').update({ item_serang: actor.item_serang - 1 }).eq('id', actor_id);
            await supabase.from('students').update({ item_perisai: target.item_perisai - 1 }).eq('id', target_id);
            
            message = `Serangan gagal! ${target.name} menggunakan perisai.`;
            actionType = 'serang_ditahan';
            targetPoinLompat = 0;
        } 
        // Skenario B: Target tidak punya perisai (Berhasil dicuri)
        else {
            const poinHilang = Math.min(target.poin, targetPoinLompat); // Cegah poin minus
            
            await supabase.from('students').update({ 
                item_serang: actor.item_serang - 1,
                poin: actor.poin + poinHilang
            }).eq('id', actor_id);

            await supabase.from('students').update({ 
                poin: target.poin - poinHilang 
            }).eq('id', target_id);

            message = `Serangan berhasil! Kamu mencuri ${poinHilang} poin dari ${target.name}.`;
            actionType = 'serang_berhasil';
        }

        // Opsional: Catat ke log gamifikasi jika tabelnya sudah kamu buat
        await supabase.from('gamification_logs').insert([{
            actor_id, target_id, action_type: actionType, point_change: targetPoinLompat
        }]);

        res.status(200).json({ status: "success", message });

    } catch (error) {
        console.error("Attack Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 3. DAFTAR TEMAN UNTUK DISERANG
const getPeers = async (req, res) => {
    try {
        const { student_id } = req.query;
        const teacherUsername = req.user.username; // Diambil dari JWT Token Ustadz

        if (!student_id) {
            return res.status(400).json({ status: "error", message: "student_id tidak ditemukan" });
        }

        // Cari teman sekelas (satu pembuat) kecuali diri sendiri
        const { data: peers, error } = await supabase
            .from('students')
            .select('id, name, item_perisai')
            .eq('created_by', teacherUsername)
            .neq('id', student_id);

        if (error) throw error;

        // Cek siapa yang lagi pake perisai
        const formattedPeers = peers.map(p => ({
            id: p.id,
            name: p.name,
            has_shield: p.item_perisai > 0
        }));

        res.status(200).json({ status: "success", data: formattedPeers });

    } catch (error) {
        console.error("Get Peers Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 4. CEK NOTIFIKASI SERANGAN (POV KORBAN)
const getAttackNotifications = async (req, res) => {
    try {
        const { student_id } = req.query;
        
        // Cari serangan yang berhasil dan belum dibaca oleh korban
        const { data: logs, error } = await supabase
            .from('gamification_logs')
            .select('*')
            .eq('target_id', student_id)
            .eq('action_type', 'serang_berhasil')
            .eq('is_read', false);

        if (error) throw error;
        if (!logs || logs.length === 0) return res.status(200).json({ status: "success", data: [] });

        // Ambil nama-nama penyerang
        const actorIds = [...new Set(logs.map(l => l.actor_id))];
        const { data: actors } = await supabase.from('students').select('id, name').in('id', actorIds);

        // Rangkum datanya
        const notifications = logs.map(log => {
            const actor = actors.find(a => a.id === log.actor_id);
            return {
                id: log.id,
                attacker_name: actor ? actor.name : 'Seseorang',
                points_lost: log.point_change
            };
        });

        res.status(200).json({ status: "success", data: notifications });
    } catch (error) {
        console.error("Get Notif Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// 5. TANDAI NOTIFIKASI SUDAH DIBACA (Agar gak muncul terus)
const markNotificationsRead = async (req, res) => {
    try {
        const { log_ids } = req.body;
        const { error } = await supabase
            .from('gamification_logs')
            .update({ is_read: true })
            .in('id', log_ids);

        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (error) {
        console.error("Mark Read Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = { buyItem, attackFriend, getPeers, getAttackNotifications, markNotificationsRead };