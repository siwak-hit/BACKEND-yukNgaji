const supabase = require('../config/supabaseClient');

const saveRecommendation = async (recData) => {
    const { data, error } = await supabase
        .from('recommendations')
        .insert([recData])
        .select()
        .single();
        
    if (error) throw error;
    return data;
};

module.exports = { saveRecommendation };