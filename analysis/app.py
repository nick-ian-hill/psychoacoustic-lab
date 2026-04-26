import streamlit as st
import plotly.graph_objects as go
import numpy as np
from psychometrics import parse_psychoacoustic_csv, fit_psychometric_curve, calculate_threshold, logistic_function, weibull_function

st.set_page_config(page_title="Psychoacoustic Lab Analysis", layout="wide")

st.title("Psychoacoustic Lab: Data Analysis")
st.markdown("Upload your `.csv` results file from the Psychoacoustic Lab web app to fit psychometric functions and calculate accurate thresholds.")

uploaded_file = st.file_uploader("Upload CSV Results", type="csv")

if uploaded_file is not None:
    try:
        df = parse_psychoacoustic_csv(uploaded_file)
        
        st.success(f"Successfully loaded data: {len(df)} trials.")
        
        st.sidebar.header("Analysis Options")
        func_type = st.sidebar.selectbox("Psychometric Function", ["Logistic", "Weibull"])
        
        # Determine the target probability based on the rules
        # If it's a 2-down 1-up, target is 70.7%. 3-down 1-up is 79.4%.
        # We don't have the rule strictly in the CSV, so we let the user choose.
        target_p = st.sidebar.slider("Target Probability (Threshold)", min_value=0.55, max_value=0.95, value=0.707, step=0.01, 
                                     help="70.7% = 2-down 1-up. 79.4% = 3-down 1-up.")
        
        discard_reversals = st.sidebar.number_input("Discard Reversals (for simple average)", min_value=0, value=4)
        
        # 1. Simple Reversal Average
        reversals = df[df['is_reversal'] == True]
        valid_reversals = reversals.iloc[discard_reversals:]
        if len(valid_reversals) > 0:
            simple_threshold = valid_reversals['parameter_value'].mean()
        else:
            simple_threshold = None

        # 2. Psychometric Curve Fitting
        # We usually ignore the first few trials (fast start) for curve fitting, or we can use all of them.
        popt, grouped_df = fit_psychometric_curve(df['parameter_value'], df['correct'], func_type)
        
        st.header("Results")
        col1, col2 = st.columns(2)
        
        with col1:
            st.subheader("Simple Reversal Average")
            if simple_threshold is not None:
                st.metric(label=f"Average of last {len(valid_reversals)} reversals", value=f"{simple_threshold:.4f}")
            else:
                st.write("Not enough reversals to calculate simple average.")
                
        with col2:
            st.subheader(f"{func_type} Curve Fit")
            if popt is not None:
                alpha, beta = popt
                exact_threshold = calculate_threshold(alpha, beta, target_p, func_type)
                
                st.metric(label=f"Threshold at p={target_p:.3f}", value=f"{exact_threshold:.4f}" if exact_threshold else "Unreachable")
                st.write(f"Parameters: $\\alpha$ (PSE) = {alpha:.3f}, $\\beta$ (Slope) = {beta:.3f}")
            else:
                st.error("Could not fit curve. Check data spread.")

        # --- Plots ---
        st.header("Visualizations")
        
        tab1, tab2, tab3 = st.tabs(["Psychometric Function", "Staircase Track", "Raw Data Table"])
        
        with tab1:
            if popt is not None:
                fig = go.Figure()
                
                # Plot raw data proportions
                fig.add_trace(go.Scatter(
                    x=grouped_df['x'], 
                    y=grouped_df['p_correct'], 
                    mode='markers',
                    marker=dict(size=grouped_df['n_trials']*2 + 5, color='blue', opacity=0.7),
                    name='Proportion Correct (size = n)'
                ))
                
                # Plot fitted curve
                x_fit = np.linspace(min(grouped_df['x'].min(), 0), grouped_df['x'].max() * 1.2, 200)
                func = logistic_function if func_type == "Logistic" else weibull_function
                y_fit = func(x_fit, alpha, beta)
                
                fig.add_trace(go.Scatter(
                    x=x_fit, 
                    y=y_fit, 
                    mode='lines',
                    line=dict(color='red'),
                    name=f'{func_type} Fit'
                ))
                
                # Add threshold line
                if exact_threshold:
                    fig.add_vline(x=exact_threshold, line_dash="dash", line_color="green", annotation_text=f"Threshold ({exact_threshold:.2f})")
                    fig.add_hline(y=target_p, line_dash="dot", line_color="green")
                
                fig.update_layout(
                    title="Psychometric Function",
                    xaxis_title="Parameter Value",
                    yaxis_title="Proportion Correct",
                    yaxis_range=[0, 1.05]
                )
                st.plotly_chart(fig, use_container_width=True)

        with tab2:
            fig_track = go.Figure()
            
            # Line
            fig_track.add_trace(go.Scatter(
                x=df['trial'],
                y=df['parameter_value'],
                mode='lines',
                line=dict(color='lightgray'),
                showlegend=False
            ))
            
            # Correct points
            correct_df = df[df['correct'] == True]
            fig_track.add_trace(go.Scatter(
                x=correct_df['trial'],
                y=correct_df['parameter_value'],
                mode='markers',
                marker=dict(color='blue', symbol='circle'),
                name='Correct'
            ))
            
            # Incorrect points
            incorrect_df = df[df['correct'] == False]
            fig_track.add_trace(go.Scatter(
                x=incorrect_df['trial'],
                y=incorrect_df['parameter_value'],
                mode='markers',
                marker=dict(color='red', symbol='x'),
                name='Incorrect'
            ))
            
            # Reversals
            fig_track.add_trace(go.Scatter(
                x=reversals['trial'],
                y=reversals['parameter_value'],
                mode='markers',
                marker=dict(color='orange', symbol='circle-open', size=12, line_width=2),
                name='Reversal'
            ))
            
            fig_track.update_layout(
                title="Adaptive Staircase Track",
                xaxis_title="Trial Number",
                yaxis_title="Parameter Value"
            )
            st.plotly_chart(fig_track, use_container_width=True)
            
        with tab3:
            st.dataframe(df)
            
    except Exception as e:
        st.error(f"Error parsing file: {str(e)}")
        st.write("Ensure you uploaded a valid CSV exported from the Psychoacoustic Lab.")
